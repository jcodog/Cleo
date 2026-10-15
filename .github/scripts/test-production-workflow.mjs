import assert from "node:assert/strict"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evaluate } from "./actions-condition.mjs"
import { packagesReady, verifyEvidence } from "./production-policy.mjs"
import { rejectedEvidence } from "./test-production-policy.mjs"

/** Parse repository YAML as data so contract assertions inspect actual fields, never translated code. */
const read = (name) =>
  Bun.YAML.parse(
    readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8")
  )
const workflow = read("production-release.yml")
/**
 * Require real step-to-job output mappings before simulating release eligibility.
 * A fabricated fixture output cannot substitute for a missing gate or planner.
 * @param {object} candidate Parsed production workflow, including mutated fixtures.
 * @throws {AssertionError} If a hold, planner invocation, identity or host contract is disconnected.
 */
function requireReleaseWiring(candidate) {
  assert.equal(
    candidate.env.AUTO_PROMOTION_ENABLED,
    "${{ vars.CLEO_PRODUCTION_AUTO_PROMOTION_ENABLED }}"
  )
  assert.deepEqual(candidate.jobs.rollout.outputs, {
    enabled: "${{ steps.gate.outputs.enabled }}",
  })
  const gates = candidate.jobs.rollout.steps.filter(
    (step) => step.id === "gate"
  )
  assert.equal(gates.length, 1)
  assert.equal(gates[0].env.EVENT_NAME, "${{ github.event_name }}")
  assert.equal(candidate.jobs.control.needs, "rollout")
  assert.ok(
    candidate.jobs.control.if.includes(
      "needs.rollout.outputs.enabled == 'true'"
    )
  )
  const plans = candidate.jobs.authorise.steps.filter(
    (step) => step.id === "plan"
  )
  assert.equal(plans.length, 1)
  assert.equal(plans[0].run, "node .github/scripts/production-policy.mjs plan")
  assert.equal(
    plans[0].if,
    undefined,
    "Planning cannot be conditionally omitted"
  )
  assert.deepEqual(
    candidate.jobs.authorise.outputs,
    Object.fromEntries(
      [
        "sha",
        "source_run",
        "source_attempt",
        "backend",
        "discord",
        "twitch",
      ].map((name) => [name, `\${{ steps.plan.outputs.${name} }}`])
    )
  )
  for (const id of ["discord-activate", "discord-rollback"])
    assert.equal(candidate.jobs[id].env.CLEO_DISCORD_HOST_CONTRACT_VERSION, "5")
}
requireReleaseWiring(workflow)
for (const value of [
  undefined,
  true,
  "true",
  "false",
  "${{ true }}",
  "${{ steps.other.outputs.enabled }}",
]) {
  const candidate = structuredClone(workflow)
  if (value === undefined) delete candidate.jobs.rollout.outputs.enabled
  else candidate.jobs.rollout.outputs.enabled = value
  assert.throws(
    () => requireReleaseWiring(candidate),
    `Unsafe rollout output: ${value}`
  )
}
for (const mutation of [
  (candidate) => {
    candidate.jobs.rollout.steps[0].id = "unconnected"
  },
  (candidate) => {
    delete candidate.env.AUTO_PROMOTION_ENABLED
  },
  (candidate) => {
    delete candidate.jobs.control.needs
  },
  (candidate) => {
    candidate.jobs.control.if = "true"
  },
  (candidate) => {
    candidate.jobs.authorise.steps = candidate.jobs.authorise.steps.filter(
      (step) => step.id !== "plan"
    )
  },
  (candidate) => {
    candidate.jobs.authorise.steps.find((step) => step.id === "plan").run =
      "echo fabricated-plan"
  },
  (candidate) => {
    candidate.jobs.authorise.steps.find((step) => step.id === "plan").id =
      "other"
  },
  (candidate) => {
    candidate.jobs.authorise.steps.find((step) => step.id === "plan").if =
      "false"
  },
]) {
  const candidate = structuredClone(workflow)
  mutation(candidate)
  assert.throws(() => requireReleaseWiring(candidate))
}
for (const name of Object.keys(workflow.jobs.authorise.outputs))
  for (const value of [
    undefined,
    "true",
    "${{ steps.other.outputs.sha }}",
    "${{ steps.plan.outputs.fabricated }}",
  ]) {
    const candidate = structuredClone(workflow)
    if (value === undefined) delete candidate.jobs.authorise.outputs[name]
    else candidate.jobs.authorise.outputs[name] = value
    assert.throws(
      () => requireReleaseWiring(candidate),
      `Unsafe planner output: ${name}`
    )
  }
for (const id of ["discord-activate", "discord-rollback"])
  for (const value of [undefined, "4", 5]) {
    const candidate = structuredClone(workflow)
    if (value === undefined)
      delete candidate.jobs[id].env.CLEO_DISCORD_HOST_CONTRACT_VERSION
    else candidate.jobs[id].env.CLEO_DISCORD_HOST_CONTRACT_VERSION = value
    assert.throws(
      () => requireReleaseWiring(candidate),
      `Unsafe host contract: ${id}`
    )
  }
/** Reject mutable checkouts, persisted credentials and cross-run policy artifacts in real or mutated YAML. */
function requirePolicySources(candidate) {
  for (const id of ["control", "authorise"]) {
    const checkout = candidate.jobs[id].steps.find((step) =>
      step.uses?.startsWith("actions/checkout@")
    )
    assert.equal(checkout.with.ref, "${{ github.workflow_sha }}")
    assert.equal(checkout.with["persist-credentials"], false)
  }
  const upload = candidate.jobs.control.steps.find((step) =>
    step.uses?.startsWith("actions/upload-artifact@")
  )
  assert.equal(upload.with.path, ".github/scripts/production-policy.mjs")
  for (const id of [
    "packages-ready",
    "backend",
    "discord-activate",
    "twitch-activate",
    "discord-rollback",
    "twitch-rollback",
  ]) {
    const job = candidate.jobs[id]
    const download = job.steps?.find(
      (step) => step.with?.path === "${{ runner.temp }}/production-policy"
    )
    assert.ok(download, `${id} requires trusted policy artifact`)
    assert.equal(download.with.name, "${{ needs.control.outputs.artifact }}")
    for (const key of ["run-id", "repository", "github-token"])
      assert.equal(download.with[key], undefined)
    assert.equal(download.with["digest-mismatch"], "error")
    const checksum = job.steps.find(
      (step) => step.name === "Verify trusted control file checksum"
    )
    assert.equal(
      checksum.env.POLICY_DIGEST,
      "${{ needs.control.outputs.digest }}"
    )
    assert.ok(
      checksum.run.includes(
        'echo "$POLICY_DIGEST  $RUNNER_TEMP/production-policy/production-policy.mjs" | sha256sum -c -'
      )
    )
  }
}
requirePolicySources(workflow)
for (const id of ["control", "authorise"])
  for (const ref of [
    "main",
    "feature/untrusted",
    "${{ github.sha }}",
    "${{ github.event.pull_request.head.sha }}",
  ]) {
    const unsafe = structuredClone(workflow)
    unsafe.jobs[id].steps.find((step) =>
      step.uses?.startsWith("actions/checkout@")
    ).with.ref = ref
    assert.throws(() => requirePolicySources(unsafe))
  }
for (const id of ["control", "authorise"]) {
  const unsafe = structuredClone(workflow)
  unsafe.jobs[id].steps.find((step) =>
    step.uses?.startsWith("actions/checkout@")
  ).with["persist-credentials"] = true
  assert.throws(() => requirePolicySources(unsafe))
}
for (const key of ["name", "run-id", "digest-mismatch"]) {
  const unsafe = structuredClone(workflow)
  unsafe.jobs.backend.steps.find(
    (step) => step.with?.path === "${{ runner.temp }}/production-policy"
  ).with[key] = "untrusted"
  assert.throws(() => requirePolicySources(unsafe))
}
for (const id of ["discord-package", "twitch-package"]) {
  assert.equal(
    workflow.jobs[id].environment,
    id === "discord-package" ? "discord-production" : "twitch-production"
  )
}
assert.equal(
  workflow.jobs["twitch-package"].steps.find((step) => step.id === "gate").env
    .DEPLOY_ENABLED,
  "${{ vars.CLEO_TWITCH_DEPLOY_ENABLED }}"
)
assert.equal(
  workflow.jobs["packages-ready"].steps.at(-1).env.TWITCH_ENABLED,
  "${{ needs.twitch-package.outputs.enabled }}"
)
assert.deepEqual(workflow.on.workflow_run, {
  workflows: ["Regression Tests and Coverage"],
  types: ["completed"],
  branches: ["main"],
})
assert.ok(!workflow.on.push)
assert.deepEqual(workflow.permissions, {})
assert.deepEqual(workflow.concurrency, {
  group: "cleo-production-promotion",
  "cancel-in-progress": false,
  queue: "max",
})
for (const service of ["discord", "twitch"]) {
  const wrapper = read(`${service}-production.yml`)
  assert.deepEqual(Object.keys(wrapper.on), ["workflow_dispatch"])
  assert.deepEqual(wrapper.on.workflow_dispatch.inputs.operation.options, [
    "validate",
    "rollback",
  ])
  assert.equal(
    wrapper.jobs.operations.uses,
    "./.github/workflows/production-release.yml"
  )
  assert.equal(wrapper.jobs.operations.with.service, service)
  assert.equal(
    wrapper.concurrency,
    undefined,
    "Only called workflow holds the shared lock"
  )
}

// Unsupported or malicious workflow text is rejected, never executed.
for (const expression of [
  "process.exit()",
  "globalThis.fetch('x')",
  "true; process.exit()",
  "true || unknown()",
  "github.constructor",
  "needs.__proto__.x",
  "success(1)",
  "true &&",
  "(true",
  "true === true",
  "${{ true",
  "true + false",
  "'unterminated",
])
  assert.throws(() => evaluate(expression, {}, []), expression)
assert.equal(evaluate("true", {}, ["failure"]), false)
assert.equal(evaluate("always()", {}, ["failure", "skipped"]), true)
assert.equal(
  evaluate(
    "!cancelled() && needs.build.result == 'success'",
    { needs: { build: { result: "success" } } },
    ["success", "skipped"]
  ),
  true
)
assert.equal(evaluate("!cancelled()", {}, ["cancelled"]), false)
assert.equal(evaluate("failure() && !cancelled()", {}, ["failure"]), true)
assert.equal(evaluate("true || false && false", {}, []), true)
assert.equal(evaluate("(true || false) && false", {}, []), false)
for (const expression of [
  "('release' || 'other') == 'release'",
  "('' || 'other') == 'other'",
  "('release' && 'other') == 'other'",
  "('' && 'other') == ''",
  "(0 || 7) == 7",
  "(false && 'other') == false",
])
  assert.equal(evaluate(expression, {}, []), true, expression)
const mainSha = "a".repeat(40)
const sourceRun = {
  repository: { full_name: "jcodog/Cleo" },
  head_repository: { full_name: "jcodog/Cleo" },
  workflow_id: 310957278,
  path: ".github/workflows/regression.yml",
  event: "push",
  head_branch: "main",
  status: "completed",
  conclusion: "success",
}
const github = {
  repository: "jcodog/Cleo",
  ref: "refs/heads/main",
  event_name: "workflow_run",
  event: { workflow_run: sourceRun },
}

/**
 * Evaluate actual job conditions and output mappings against controlled step outcomes.
 * @param {object} options Source context, component scope, API evidence and dependency failures.
 * @returns {object} Per-job results and YAML-resolved outputs; fixtures never invoke production.
 */
function graph({
  githubContext = github,
  inputs = {},
  scope = { backend: true, discord: true, twitch: true },
  overrides = {},
  autoEnabled = "true",
  evidence,
  candidate = workflow,
} = {}) {
  const results = {}
  for (const [id, job] of Object.entries(candidate.jobs)) {
    const dependencies =
      typeof job.needs === "string" ? [job.needs] : (job.needs ?? [])
    const needs = Object.fromEntries(
      dependencies.map((dep) => [dep, results[dep]])
    )
    const statuses = dependencies.map((dep) => results[dep].result)
    const eligible = job.if
      ? evaluate(
          job.if,
          {
            github: githubContext,
            inputs,
            needs,
            vars: { CLEO_PRODUCTION_AUTO_PROMOTION_ENABLED: autoEnabled },
          },
          statuses
        )
      : statuses.every((result) => result === "success")
    let result = eligible ? (overrides[id] ?? "success") : "skipped"
    if (id === "authorise" && eligible && evidence) {
      try {
        verifyEvidence(evidence)
      } catch {
        result = "failure"
      }
    }
    if (id === "packages-ready" && eligible) {
      try {
        packagesReady(scope, {
          discord: results["discord-package"].result,
          twitch: results["twitch-package"].result,
        })
      } catch {
        result = "failure"
      }
    }
    // Resolve simulated step values through the validated YAML job-output fields.
    const stepValues = {
      plan: {
        ...Object.fromEntries(
          Object.entries(scope).map(([key, value]) => [key, String(value)])
        ),
        sha: mainSha,
        source_run: "10",
        source_attempt: "1",
      },
      gate: {
        enabled: String(
          githubContext.event_name !== "workflow_run" ||
            autoEnabled.toLowerCase() === "true"
        ),
      },
    }
    const outputs = ["authorise", "rollout"].includes(id)
      ? Object.fromEntries(
          Object.entries(job.outputs).map(([key, reference]) => {
            const match =
              /^\$\{\{ steps\.(plan|gate)\.outputs\.([a-z_]+) \}\}$/.exec(
                reference
              )
            assert.ok(match, "Unsupported fixture output reference")
            assert.ok(Object.hasOwn(stepValues[match[1]], match[2]))
            return [key, stepValues[match[1]][match[2]]]
          })
        )
      : {}
    results[id] = { result, outputs }
  }
  return results
}
const productionJobs = ["backend", "discord-activate", "twitch-activate"]
const rollbackJobs = ["discord-rollback", "twitch-rollback"]
/** Require all production mutation jobs to be skipped for rejected event/dependency evidence. */
const assertBlocked = (result) => {
  for (const id of [...productionJobs, ...rollbackJobs])
    assert.equal(result[id].result, "skipped", id)
}
for (const autoEnabled of ["", "false", "yes", " true"])
  assertBlocked(graph({ autoEnabled }))
const success = graph()
for (const id of productionJobs) assert.equal(success[id].result, "success")
for (const id of rollbackJobs) assert.equal(success[id].result, "skipped", id)
for (const evidence of rejectedEvidence) assertBlocked(graph({ evidence }))
for (const conclusion of ["failure", "cancelled", "skipped", null])
  assertBlocked(
    graph({
      githubContext: {
        ...github,
        event: { workflow_run: { ...sourceRun, conclusion } },
      },
    })
  )
for (const patch of [
  { repository: "fork/Cleo" },
  { ref: "refs/heads/feature" },
  { event_name: "pull_request" },
])
  assertBlocked(graph({ githubContext: { ...github, ...patch } }))
for (const patch of [
  { repository: { full_name: "fork/Cleo" } },
  { head_repository: { full_name: "fork/Cleo" } },
  { workflow_id: 11 },
  { path: "other.yml" },
  { event: "pull_request" },
  { head_branch: "feature" },
  { status: "in_progress" },
])
  assertBlocked(
    graph({
      githubContext: {
        ...github,
        event: { workflow_run: { ...sourceRun, ...patch } },
      },
    })
  )
for (const id of ["discord-package", "twitch-package"])
  for (const status of ["failure", "cancelled", "skipped"])
    assertBlocked(graph({ overrides: { [id]: status } }))
for (const status of ["failure", "cancelled", "skipped"]) {
  const blocked = graph({ overrides: { backend: status } })
  assert.equal(blocked["discord-activate"].result, "skipped")
  assert.equal(blocked["twitch-activate"].result, "skipped")
}
const web = graph({ scope: { backend: false, discord: false, twitch: false } })
assert.equal(
  web.backend.result,
  "success",
  "No-op barrier must not break the graph"
)
assert.equal(web["discord-activate"].result, "skipped")
assert.equal(web["twitch-activate"].result, "skipped")
for (const service of ["discord", "twitch"]) {
  const selected = graph({
    scope: {
      backend: false,
      discord: service === "discord",
      twitch: service === "twitch",
    },
  })
  assert.equal(selected[`${service}-activate`].result, "success")
  assert.equal(
    selected[`${service === "discord" ? "twitch" : "discord"}-activate`].result,
    "skipped"
  )
}
const manualGithub = { ...github, event_name: "workflow_dispatch", event: {} }
// The first control step validates rollback scope before artifacts or privileged jobs.
const operationGuard = workflow.jobs.control.steps[0].run
for (const [operation, service, expected] of [
  ["validate", "both", 0],
  ["deploy", "both", 0],
  ["rollback", "discord", 0],
  ["rollback", "twitch", 0],
  ["rollback", "both", 1],
  ["rollback", "unknown", 1],
]) {
  const result = spawnSync("bash", ["-e", "-c", operationGuard], {
    env: { ...process.env, INPUT_OPERATION: operation, INPUT_SERVICE: service },
    encoding: "utf8",
  })
  assert.ifError(result.error)
  assert.equal(
    result.status,
    expected,
    `${operation}/${service}: ${result.stderr}`
  )
  if (expected) {
    const rejected = graph({
      githubContext: manualGithub,
      inputs: { operation, service },
      overrides: { control: "failure" },
    })
    assertBlocked(rejected)
  }
}
assertBlocked(
  graph({
    githubContext: manualGithub,
    inputs: { operation: "validate", sha: mainSha },
  })
)
/** Require incident recovery to select exactly one runtime and no forward mutation. */
const assertRecovery = (recovery, service) => {
  assert.equal(recovery[`${service}-rollback`].result, "success")
  assert.equal(
    recovery[`${service === "discord" ? "twitch" : "discord"}-rollback`].result,
    "skipped"
  )
  assert.equal(recovery.authorise.result, "skipped")
  for (const id of productionJobs)
    assert.equal(recovery[id].result, "skipped", id)
}
for (const service of ["discord", "twitch"]) {
  const options = {
    githubContext: manualGithub,
    inputs: { operation: "rollback", service },
    overrides: { authorise: "failure", backend: "failure" },
  }
  assertRecovery(graph(options), service)
  const candidate = structuredClone(workflow)
  candidate.jobs[
    `${service === "discord" ? "twitch" : "discord"}-rollback`
  ].if = "always()"
  assert.throws(() => assertRecovery(graph({ ...options, candidate }), service))
}
for (const id of rollbackJobs) {
  const candidate = structuredClone(workflow)
  candidate.jobs[id].if = "always()"
  assert.throws(() => assertBlocked(graph({ candidate })), id)
  assert.throws(() => assertBlocked(graph({ candidate, autoEnabled: "" })), id)
}

// Trace real dependencies to production actions, and inspect each action's guard.
for (const id of productionJobs) {
  const job = workflow.jobs[id]
  assert.ok(job.needs.includes("authorise"))
  assert.ok(job.if.includes("success"))
  assert.ok(!job.if.includes("always()"))
  assert.ok(
    ["discord-production", "twitch-production"].includes(job.environment)
  )
  assert.equal(job.permissions.actions, "read")
  assert.equal(job.permissions.deployments, "write")
  const claim = job.steps.find((step) => step.id === "claim")
  assert.ok(claim.run.includes('production-policy.mjs" claim'))
  const mutation = {
    backend: "bun run --filter @workspace/backend deploy",
    "discord-activate": "/usr/local/libexec/cleo/deploy-discord-release deploy",
    "twitch-activate":
      "/usr/local/libexec/cleo/twitch/deploy-twitch-release deploy",
  }[id]
  const actions = job.steps.filter((step) => step.run?.includes(mutation))
  assert.equal(actions.length, 1, `${id}: one guarded production command`)
  /** Require the actual mutation command to follow its policy recheck within the same shell. */
  const requireRecheck = (script) => {
    const guard = script.indexOf('production-policy.mjs" recheck')
    assert.ok(
      guard >= 0 && guard < script.indexOf(mutation),
      `${id}: same shell must recheck before mutation`
    )
  }
  requireRecheck(actions[0].run)
  assert.throws(() =>
    requireRecheck(mutation + '\nnode production-policy.mjs" recheck')
  )
  assert.throws(() => requireRecheck(mutation))
  assert.ok(
    job.steps.find(
      (step) => step.name === "Verify trusted control file checksum"
    )
  )
  const controlDownload = job.steps.find(
    (step) => step.with?.name === "${{ needs.control.outputs.artifact }}"
  )
  assert.equal(controlDownload.with["digest-mismatch"], "error")
  if (id !== "backend") {
    assert.equal(job["runs-on"], "cleo-prod")
    assert.ok(
      !job.steps.some((step) => step.uses?.startsWith("actions/checkout@"))
    )
    assert.ok(job.needs.includes("backend"))
  }
}
const discordActivation = workflow.jobs["discord-activate"]
assert.ok(
  discordActivation.steps
    .find((step) => step.id === "restored_commands")
    .if.includes("steps.runtime.outputs.attempted == 'true'")
)
const runtimeScript = discordActivation.steps.find(
  (step) => step.id === "runtime"
).run
assert.ok(
  runtimeScript.indexOf('production-policy.mjs" recheck') <
    runtimeScript.indexOf('echo "attempted=true"')
)
assert.ok(
  runtimeScript.indexOf('echo "attempted=true"') <
    runtimeScript.indexOf(
      "/usr/local/libexec/cleo/deploy-discord-release deploy"
    )
)
const backendActions = Object.values(workflow.jobs)
  .flatMap((job) => job.steps ?? [])
  .filter((step) =>
    step.run?.includes("bun run --filter @workspace/backend deploy")
  )
assert.equal(backendActions.length, 1)
assert.ok(backendActions[0].if.includes("steps.claim.outputs.apply == 'true'"))
assert.equal(
  workflow.jobs["discord-package"].steps.find((step) => step.id === "gate").run,
  workflow.jobs["twitch-package"].steps.find((step) => step.id === "gate").run,
  "Both protected enablement controls use the shell gate exercised by the operation fixtures"
)

// Execute the actual barrier shell and CLI, including protected enablement flags.
const fixtureDirectory = mkdtempSync(join(tmpdir(), "cleo-package-barrier-"))
try {
  mkdirSync(join(fixtureDirectory, "production-policy"))
  copyFileSync(
    new URL("./production-policy.mjs", import.meta.url),
    join(fixtureDirectory, "production-policy/production-policy.mjs")
  )
  const eventPath = join(fixtureDirectory, "event.json")
  writeFileSync(eventPath, "{}")
  const script = workflow.jobs["packages-ready"].steps.at(-1).run
  const defaults = {
    RUNNER_TEMP: fixtureDirectory.replaceAll("\\", "/"),
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "jcodog/Cleo",
    GITHUB_REF: "refs/heads/main",
    INPUT_OPERATION: "deploy",
    INPUT_SHA: mainSha,
    INPUT_RUN_ID: "10",
    INPUT_RUN_ATTEMPT: "1",
    INPUT_SERVICE: "both",
    DISCORD_REQUIRED: "true",
    TWITCH_REQUIRED: "true",
    DISCORD_RESULT: "success",
    TWITCH_RESULT: "success",
    DISCORD_ENABLED: "true",
    TWITCH_ENABLED: "true",
  }
  // Run both actual protected gates, including case handling and invalid values.
  for (const service of ["discord", "twitch"]) {
    const gate = workflow.jobs[`${service}-package`].steps.find(
      (step) => step.id === "gate"
    )
    assert.equal(
      gate.env.DEPLOY_ENABLED,
      `\${{ vars.CLEO_${service.toUpperCase()}_DEPLOY_ENABLED }}`
    )
    for (const value of [
      "true",
      "TRUE",
      "True",
      "tRuE",
      "false",
      "yes",
      "1",
      "",
      " true",
      "true ",
    ]) {
      const output = join(fixtureDirectory, `${service}-gate-output`)
      writeFileSync(output, "")
      const result = spawnSync(
        "bash",
        ["-e", "-o", "pipefail", "-c", gate.run],
        {
          env: { ...process.env, DEPLOY_ENABLED: value, GITHUB_OUTPUT: output },
          encoding: "utf8",
          timeout: 10000,
        }
      )
      assert.ifError(result.error)
      assert.equal(result.status, 0, result.stderr)
      assert.equal(
        readFileSync(output, "utf8").trim(),
        `enabled=${value.toLowerCase() === "true"}`
      )
    }
  }
  // A rejected final recheck releases only the unused claim. Once deploy starts,
  // any failure retains the uncertain claim and can never silently retry Convex.
  const backendScript = backendActions[0].run
  for (const [recheckStatus, deployStatus, expectedStatus, expectedCalls] of [
    [1, 0, 1, ["recheck", "release"]],
    [0, 1, 1, ["recheck", "deploy"]],
    [0, 0, 0, ["recheck", "deploy"]],
  ]) {
    const log = join(fixtureDirectory, "backend-calls")
    writeFileSync(log, "")
    const stubs =
      'node() { echo "${@: -1}" >> "$CALL_LOG"; if [[ "${@: -1}" == recheck ]]; then return "$RECHECK_STATUS"; fi; }\nbun() { echo deploy >> "$CALL_LOG"; return "$DEPLOY_STATUS"; }\n'
    const result = spawnSync(
      "bash",
      ["-e", "-o", "pipefail", "-c", stubs + backendScript],
      {
        env: {
          ...process.env,
          CALL_LOG: log,
          RECHECK_STATUS: String(recheckStatus),
          DEPLOY_STATUS: String(deployStatus),
        },
        encoding: "utf8",
        timeout: 10000,
      }
    )
    assert.ifError(result.error)
    assert.equal(result.status, expectedStatus, result.stderr)
    assert.deepEqual(
      readFileSync(log, "utf8").trim().split("\n"),
      expectedCalls
    )
  }
  for (const [patch, expected] of [
    [{}, 0],
    [{ DISCORD_ENABLED: "false" }, 1],
    [{ TWITCH_ENABLED: "false" }, 1],
    [{ DISCORD_RESULT: "failure" }, 1],
    [{ TWITCH_RESULT: "skipped" }, 1],
    [
      {
        DISCORD_REQUIRED: "false",
        DISCORD_RESULT: "skipped",
        DISCORD_ENABLED: "false",
      },
      0,
    ],
    [
      {
        INPUT_OPERATION: "validate",
        DISCORD_ENABLED: "false",
        TWITCH_ENABLED: "false",
      },
      0,
    ],
  ]) {
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      env: { ...process.env, ...defaults, ...patch },
      encoding: "utf8",
      timeout: 10000,
    })
    assert.ifError(result.error)
    assert.equal(
      result.status,
      expected,
      `${JSON.stringify(patch)}: ${result.stderr}`
    )
  }
} finally {
  rmSync(fixtureDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
for (const service of ["discord", "twitch"]) {
  const job = workflow.jobs[`${service}-package`]
  const upload = job.steps.find((step) =>
    step.uses?.startsWith("actions/upload-artifact@")
  )
  assert.equal(
    job.outputs.artifact_name,
    upload.with.name,
    "Package output must identify the artifact actually uploaded"
  )
  assert.equal((upload.with.name.match(/github\.run_attempt/g) ?? []).length, 1)
  const activationDownload = workflow.jobs[`${service}-activate`].steps.find(
    (step) => step.with?.path === `\${{ runner.temp }}/cleo-${service}-release`
  )
  assert.equal(
    activationDownload.with.name,
    `\${{ needs.${service}-package.outputs.artifact_name }}`
  )
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@")
  )
  assert.equal(checkout.with.ref, "${{ needs.authorise.outputs.sha }}")
  assert.equal(checkout.with["persist-credentials"], false)
  assert.ok(job.steps.some((step) => step.run === "bun ci"))
  assert.ok(
    job.steps.some((step) =>
      step.run?.includes('git rev-parse HEAD)" = "$RELEASE_SHA"')
    )
  )
  assert.ok(!job.steps.some((step) => step.env?.CONVEX_DEPLOY_KEY))
  const rollback = workflow.jobs[`${service}-rollback`]
  assert.equal(rollback.needs, "control")
  assert.ok(!rollback.steps.some((step) => step.run?.includes(" recheck")))
}
console.log(
  "Actual production YAML condition fixtures, package/backend failure graphs, validation isolation, manual recovery and exact-SHA contracts passed."
)
