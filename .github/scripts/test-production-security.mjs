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
  for (const [id, job] of Object.entries(workflow.jobs)) {
    assert.equal(job.env?.GH_TOKEN, undefined, `${id}: no job-wide token`)
    assert.equal(job.env?.CONVEX_DEPLOY_KEY, undefined)
    for (const step of job.steps ?? []) {
      if (step.env?.GH_TOKEN) assert.match(step.run, /production-policy\.mjs/)
      if (/bun ci| build(?:\n|$)/.test(step.run ?? "")) {
        assert.equal(step.env?.GH_TOKEN, undefined)
        assert.equal(step.env?.CONVEX_DEPLOY_KEY, undefined)
      }
    }
  }
  const restoredCondition = workflow.jobs["discord-activate"].steps.find(
    (step) => step.id === "restored_commands"
  ).if
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
          runtime: { outputs: { completed: status === "143" ? "" : "true" } },
        }
        for (const name of ["commands", "recovery", "restored_commands"])
          steps[name] = { outcome: "skipped" }
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
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5 })
}
console.log(
  "Actual production shell credential isolation, rollout hold, preflight cleanup and confirmed/interrupted receipt conditions passed."
)
