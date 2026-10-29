import assert from "node:assert/strict"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { evaluate } from "./actions-condition.mjs"

const workflow = Bun.YAML.parse(
  readFileSync(
    new URL("../workflows/production-release.yml", import.meta.url),
    "utf8"
  )
)
/** Enforce credential boundaries on actual YAML at every inheritance level, including aliases. */
function requireCredentialIsolation(candidate) {
  const keys = ["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY", "VERCEL_TOKEN"]
  for (const key of keys)
    assert.equal(candidate.env?.[key], undefined, `workflow: ${key}`)
  for (const [id, job] of Object.entries(candidate.jobs)) {
    for (const key of keys)
      assert.equal(job.env?.[key], undefined, `${id}: ${key}`)
    for (const step of job.steps ?? []) {
      assert.equal(
        step.env?.GITHUB_TOKEN,
        undefined,
        "Use only explicit policy GH_TOKEN"
      )
      if (step.env?.GH_TOKEN) assert.match(step.run, /production-policy\.mjs/)
      if (step.env?.VERCEL_TOKEN) {
        assert.match(step.run, /production-policy\.mjs/)
        assert.match(step.run, / web-(stage|promote)$/)
      }
      if (step.env?.CONVEX_DEPLOY_KEY)
        assert.match(step.run, /bun run --filter @workspace\/backend deploy/)
      if (/\bbun\s+(?:ci|install)\b|\bbuild\b/.test(step.run ?? ""))
        for (const key of keys)
          assert.equal(step.env?.[key], undefined, `${id} build: ${key}`)
    }
  }
}
requireCredentialIsolation(workflow)
for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY"]) {
  const inherited = structuredClone(workflow)
  inherited.env[key] = "unsafe"
  assert.throws(() => requireCredentialIsolation(inherited))
  for (const id of Object.keys(workflow.jobs)) {
    const candidate = structuredClone(workflow)
    candidate.jobs[id].env = { ...candidate.jobs[id].env, [key]: "unsafe" }
    assert.throws(() => requireCredentialIsolation(candidate))
    for (const [index, step] of workflow.jobs[id].steps.entries())
      if (/\bbun\s+(?:ci|install)\b|\bbuild\b/.test(step.run ?? "")) {
        const build = structuredClone(workflow)
        build.jobs[id].steps[index].env = { ...step.env, [key]: "unsafe" }
        assert.throws(() => requireCredentialIsolation(build))
      }
  }
}
const directory = mkdtempSync(join(tmpdir(), "cleo-production-environment-"))
const sha = "a".repeat(40)
try {
  const bin = join(directory, "bin")
  mkdirSync(bin)
  /** Install a disposable command adapter; it asserts child environments without touching installed host tooling. */
  const writeTool = (name, body) => {
    const file = join(bin, name)
    writeFileSync(file, "#!/usr/bin/env bash\nset -euo pipefail\n" + body, {
      mode: 0o755,
    })
    return file.replaceAll("\\", "/")
  }
  const policyNode = writeTool(
    "policy-node",
    `
if [[ "\${1:-}" == --input-type=module ]]; then
  [[ -z "\${GH_TOKEN+x}" && -z "\${GITHUB_TOKEN+x}" && -z "\${CONVEX_DEPLOY_KEY+x}" ]]
  echo fixture-metadata
  exit 0
fi
command="\${@: -1}"
echo "$command" >> "$CALL_LOG"
[[ "\${GH_TOKEN:-}" == fixture-github-token ]]
[[ -z "\${CONVEX_DEPLOY_KEY+x}" ]]
if [[ "$command" == recheck ]]; then exit "$RECHECK_STATUS"; fi
if [[ "$command" == release ]]; then exit "$RELEASE_STATUS"; fi
exit 1
`
  )
  const controller = writeTool(
    "controller",
    `
echo controller >> "$CALL_LOG"
[[ -z "\${GH_TOKEN+x}" && -z "\${GITHUB_TOKEN+x}" && -z "\${CONVEX_DEPLOY_KEY+x}" ]]
exit "$CONTROLLER_STATUS"
`
  )
  const deployBun = writeTool(
    "deploy-bun",
    `
echo deploy >> "$CALL_LOG"
[[ -z "\${GH_TOKEN+x}" && -z "\${GITHUB_TOKEN+x}" ]]
[[ "\${CONVEX_DEPLOY_KEY:-}" == fixture-convex-key ]]
exit "$CONTROLLER_STATUS"
`
  )
  /**
   * Execute an actual workflow shell with non-secret credentials and isolated controller adapters.
   * @param {string} script Unchanged shell ordering, with only absolute tool paths adapted for fixtures.
   * @param {object} patch Controlled command outcomes or event/rollout inputs.
   * @returns {object} Exit status, outputs, summary and command order for preflight/interruption assertions.
   */
  const run = (script, patch = {}) => {
    // Real operator credentials must never influence or reach disposable adapters.
    const environment = {
      ...process.env,
      GITHUB_TOKEN: "ambient-fixture-github-token",
      CONVEX_DEPLOY_KEY: "ambient-fixture-convex-key",
    }
    for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY"])
      delete environment[key]
    const output = join(directory, "outputs")
    const calls = join(directory, "calls")
    const summary = join(directory, "summary")
    for (const file of [output, calls, summary]) writeFileSync(file, "")
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...environment,
        PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
        GH_TOKEN: "fixture-github-token",
        CLEO_DISCORD_HOST_NODE: policyNode,
        POLICY_TEST_NODE: policyNode,
        POLICY_TEST_BUN: deployBun,
        POLICY_TEST_CONTROLLER: controller,
        RELEASE_SHA: sha,
        CLEO_DISCORD_EXPECTED_SHA: sha,
        CLEO_DISCORD_DEPLOY_ROOT: "/fixture",
        CLEO_DISCORD_SERVICE: "cleo-discord.service",
        CLEO_DISCORD_COMMAND_SERVICE: "cleo-discord-register-commands.service",
        RUNNER_TEMP: directory.replaceAll("\\", "/"),
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        CALL_LOG: calls,
        RECHECK_STATUS: "0",
        RELEASE_STATUS: "0",
        CONTROLLER_STATUS: "0",
        ARTIFACT_DIRECTORY: "/fixture",
        ...patch,
      },
    })
    assert.ifError(result.error)
    return {
      ...result,
      output: readFileSync(output, "utf8"),
      calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean),
      summary: readFileSync(summary, "utf8"),
    }
  }
  // Run the real rollout shell, not synthetic outputs alone.
  const rollout = workflow.jobs.rollout.steps[0].run
  for (const event of ["workflow_run", "workflow_dispatch"])
    for (const flag of ["", "false", "true", "TRUE", "yes", " true"]) {
      const result = run(rollout, {
        EVENT_NAME: event,
        AUTO_PROMOTION_ENABLED: flag,
        COORDINATED_RELEASE_ENABLED: "true",
        INPUT_OPERATION: "deploy",
      })
      assert.equal(result.status, 0, result.stderr)
      const enabled = event !== "workflow_run" || flag.toLowerCase() === "true"
      assert.equal(result.output, `enabled=${enabled}\n`)
      if (!enabled)
        assert.match(
          result.summary,
          /Automatic production promotion is disabled/
        )
    }
  const restoredCondition = workflow.jobs["discord-activate"].steps.find(
    (step) => step.id === "restored_commands"
  ).if
  for (const flag of ["", "false", "yes", " true", "true", "TRUE"]) {
    const result = run(rollout, {
      EVENT_NAME: "workflow_run",
      INPUT_OPERATION: "deploy",
      AUTO_PROMOTION_ENABLED: "true",
      COORDINATED_RELEASE_ENABLED: flag,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.output, `enabled=${flag.toLowerCase() === "true"}\n`)
  }
  for (const completed of ["", "true"]) {
    assert.equal(
      evaluate(
        restoredCondition,
        {
          steps: {
            runtime: {
              outcome: "failure",
              outputs: { attempted: "true", completed },
            },
            recovery: { outcome: "skipped" },
          },
        },
        ["failure"]
      ),
      completed === "true"
    )
  }
  const backend = workflow.jobs.backend.steps.find((step) =>
    step.run?.includes("bun run --filter @workspace/backend deploy")
  )
  for (const [recheck, deploy, cleanup, expectedStatus, calls] of [
    ["0", "0", "0", 0, ["recheck", "deploy"]],
    ["1", "0", "0", 1, ["recheck", "release"]],
    ["1", "0", "1", 1, ["recheck", "release"]],
    ["0", "1", "0", 1, ["recheck", "deploy"]],
  ]) {
    const result = run(
      backend.run
        .replaceAll('node "$RUNNER_TEMP/', '"$POLICY_TEST_NODE" "$RUNNER_TEMP/')
        .replace("bun run --filter", '"$POLICY_TEST_BUN" run --filter'),
      {
        CONVEX_DEPLOY_KEY: "fixture-convex-key",
        RECHECK_STATUS: recheck,
        CONTROLLER_STATUS: deploy,
        RELEASE_STATUS: cleanup,
      }
    )
    assert.equal(result.status, expectedStatus, result.stderr)
    assert.deepEqual(result.calls, calls)
  }
  for (const service of ["discord", "twitch"]) {
    for (const operation of ["activate", "rollback"]) {
      const job = workflow.jobs[`${service}-${operation}`]
      const runtime = job.steps.find((step) => step.id === "runtime")
      const finalise = job.steps.find((step) =>
        step.name?.startsWith("Finalise confirmed")
      )
      assert.ok(finalise)
      assert.equal(finalise.env.RECEIPT_STATE, "${{ job.status }}")
      if (operation === "rollback")
        assert.equal(finalise.env.RELEASE_SHA, "${{ steps.claim.outputs.sha }}")
      let script = runtime.run
        .replaceAll(
          "/usr/local/libexec/cleo/twitch/node",
          '"$POLICY_TEST_NODE"'
        )
        .replaceAll(
          "/usr/local/libexec/cleo/twitch/deploy-twitch-release",
          '"$POLICY_TEST_CONTROLLER"'
        )
        .replaceAll(
          "/usr/local/libexec/cleo/deploy-discord-release",
          '"$POLICY_TEST_CONTROLLER"'
        )
        .replaceAll(
          "/usr/local/libexec/cleo/read-discord-deployment-state",
          "fixture_state"
        )
      assert.ok(
        !script.includes("/usr/local/libexec/cleo/"),
        "No installed host tool can run in fixtures"
      )
      const stubs = `readlink() { echo /fixture/${sha}; }\nsystemctl() { echo active; }\nfixture_state() { printf '%s\\n' '${sha}' '${sha}' 'fingerprint'; }\n`
      script = stubs + script
      for (const status of ["0", "1", "143"]) {
        // Rollback's real step has no token. Activation unexports the step token.
        const patch = { CONTROLLER_STATUS: status }
        if (operation === "rollback") patch.GH_TOKEN = undefined
        const result = run(script, patch)
        assert.equal(result.status, Number(status), result.stderr)
        assert.equal(result.output.includes("completed=true"), status !== "143")
        assert.deepEqual(
          result.calls,
          operation === "activate" ? ["recheck", "controller"] : ["controller"]
        )
        const steps = {
          runtime: {
            outcome: status === "0" ? "success" : "failure",
            outputs: { completed: status === "143" ? "" : "true" },
          },
        }
        for (const name of ["commands", "recovery", "restored_commands"])
          steps[name] = { outcome: "skipped" }
        if (service === "discord")
          steps[status === "0" ? "commands" : "restored_commands"] = {
            outcome: "success",
            outputs: { completed: "true" },
          }
        assert.equal(
          evaluate(finalise.if, { steps }, [
            status === "0" ? "success" : "failure",
          ]),
          status !== "143"
        )
        assert.equal(evaluate(finalise.if, { steps }, ["cancelled"]), false)
      }
      if (operation === "activate") {
        for (const release of ["0", "1"]) {
          const result = run(script, {
            RECHECK_STATUS: "1",
            RELEASE_STATUS: release,
          })
          assert.equal(result.status, 1, result.stderr)
          assert.deepEqual(result.calls, ["recheck", "release"])
          assert.ok(
            !result.output.includes("attempted=true") &&
              !result.output.includes("completed=true")
          )
        }
      }
      if (service === "discord") {
        /** A completed failure is terminal failure; missing confirmation stays uncertain. */
        const state = (outcome, completed = true) => ({
          outcome,
          outputs: { completed: completed ? "true" : "" },
        })
        const cases =
          operation === "activate"
            ? [
                [
                  "success",
                  { runtime: state("success"), commands: state("success") },
                  true,
                ],
                [
                  "success",
                  {
                    runtime: state("success"),
                    commands: state("skipped", false),
                  },
                  false,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure", false),
                  },
                  false,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure"),
                    recovery: state("skipped", false),
                  },
                  false,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure"),
                    recovery: state("failure", false),
                  },
                  false,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure"),
                    recovery: state("failure"),
                  },
                  true,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure"),
                    recovery: state("success"),
                    restored_commands: state("success"),
                  },
                  true,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure"),
                    recovery: state("success"),
                    restored_commands: state("failure"),
                  },
                  true,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure"),
                    recovery: state("success"),
                    restored_commands: state("failure", false),
                  },
                  false,
                ],
                [
                  "failure",
                  {
                    runtime: state("failure"),
                    restored_commands: state("success"),
                  },
                  true,
                ],
                [
                  "failure",
                  {
                    runtime: state("failure"),
                    restored_commands: state("skipped", false),
                  },
                  false,
                ],
              ]
            : [
                [
                  "success",
                  { runtime: state("success"), commands: state("success") },
                  true,
                ],
                [
                  "success",
                  {
                    runtime: state("success"),
                    commands: state("skipped", false),
                  },
                  false,
                ],
                [
                  "failure",
                  { runtime: state("success"), commands: state("failure") },
                  true,
                ],
                [
                  "failure",
                  {
                    runtime: state("success"),
                    commands: state("failure", false),
                  },
                  false,
                ],
                [
                  "failure",
                  {
                    runtime: state("failure"),
                    commands: state("skipped", false),
                  },
                  true,
                ],
              ]
        cases.push([
          "success",
          { runtime: state("success"), commands: state("success", false) },
          false,
        ])
        /** Check actual YAML receipt eligibility and ensure failed recovery never becomes a success receipt. */
        const checkFinalisation = (condition) => {
          for (const [status, patch, expected] of cases) {
            const steps = Object.fromEntries(
              ["runtime", "commands", "recovery", "restored_commands"].map(
                (name) => [name, state("skipped", false)]
              )
            )
            Object.assign(steps, patch)
            assert.equal(
              evaluate(condition, { steps }, [status]),
              expected,
              JSON.stringify(patch)
            )
            assert.equal(evaluate(condition, { steps }, ["cancelled"]), false)
            if (expected && status === "failure")
              assert.equal(finalise.env.RECEIPT_STATE, "${{ job.status }}")
          }
        }
        checkFinalisation(finalise.if)
        assert.throws(() =>
          checkFinalisation(
            "!cancelled() && steps.runtime.outputs.completed == 'true'"
          )
        )
        assert.throws(() =>
          checkFinalisation(
            finalise.if.replaceAll(
              "steps.commands.outputs.completed == 'true'",
              "true"
            )
          )
        )
        for (const id of ["commands", "recovery", "restored_commands"]) {
          const followup = job.steps.find((step) => step.id === id)
          if (!followup) continue
          const commandScript =
            stubs +
            `sudo() { if [[ "$*" == *reset-failed* ]]; then return 0; fi; echo commands >> "$CALL_LOG"; return "$CONTROLLER_STATUS"; }\n` +
            followup.run.replaceAll(
              "/usr/local/libexec/cleo/deploy-discord-release",
              '"$POLICY_TEST_CONTROLLER"'
            )
          for (const status of ["0", "1", "143"]) {
            const result = run(commandScript, {
              GH_TOKEN: followup.env?.GH_TOKEN
                ? "fixture-github-token"
                : undefined,
              CONTROLLER_STATUS: status,
            })
            assert.equal(result.status, Number(status), result.stderr)
            assert.equal(
              result.output.includes("completed=true"),
              status !== "143"
            )
          }
        }
      }
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5 })
}
console.log(
  "Actual production shell credential isolation, rollout hold, preflight cleanup and confirmed/interrupted receipt conditions passed."
)
