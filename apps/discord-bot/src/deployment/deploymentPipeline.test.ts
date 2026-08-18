import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url))

function repositoryFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8")
}

function workflowJob(workflow: string, job: string, nextJob?: string): string {
  const start = workflow.indexOf(`  ${job}:`)
  const end =
    nextJob === undefined ? workflow.length : workflow.indexOf(`  ${nextJob}:`)
  assert.notEqual(start, -1, `missing ${job} workflow job`)
  assert.notEqual(end, -1, `missing ${nextJob} workflow job`)
  return workflow.slice(start, end)
}

test("production workflow builds once and packages the validated output", () => {
  const workflow = repositoryFile(".github/workflows/discord-production.yml")
  const packager = repositoryFile(".github/scripts/package-discord-release.sh")
  const buildInvocations = workflow.match(
    /bun run --filter @workspace\/discord-bot build/g
  )

  assert.equal(buildInvocations?.length, 1)
  assert.doesNotMatch(packager, /bun run --filter @workspace\/discord-bot build/)
  assert.match(packager, /Validated Discord build output is missing/)
  assert.match(packager, /Packaging mutated the validated Discord build output/)
  assert.match(
    packager,
    /Packaged Discord build differs from the validated build output/
  )
  assert.match(workflow, /runs-on: ubuntu-24\.04-arm/)
  assert.match(workflow, /process\.platform.*process\.arch.*linux-arm64/)
  assert.match(
    repositoryFile("apps/discord-bot/runtime-artifact.json"),
    /canvas-linux-arm64-gnu/
  )
})

test("VPS activation and rollback are source and package-manager independent", () => {
  const workflow = repositoryFile(".github/workflows/discord-production.yml")
  const activate = workflowJob(workflow, "activate", "rollback")
  const rollback = workflowJob(workflow, "rollback")
  const forbidden = [
    /actions\/checkout/,
    /setup-bun/,
    /setup-node/,
    /\bbun\s+(?:ci|install|run)\b/,
    /\bpnpm\b/,
    /git\s/,
    /run (?:build|lint|test|typecheck)/,
    /convex deploy/i,
  ]

  for (const job of [activate, rollback]) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(job, pattern)
    }
    assert.match(job, /\/usr\/local\/libexec\/cleo\/deploy-discord-release/)
    assert.match(job, /\/usr\/local\/libexec\/cleo\/check-discord-runner/)
    assert.match(job, /\/usr\/local\/libexec\/cleo\/read-discord-deployment-state/)
    assert.match(job, /GITHUB_STEP_SUMMARY/)
    assert.match(job, /Running SHA after attempt/)
    assert.match(job, /Service status/)
  }
  assert.match(activate, /Attempted SHA/)
  assert.match(rollback, /Rollback target/)
  assert.ok(
    activate.indexOf("deploy-discord-release contract-version") <
      activate.indexOf("actions/download-artifact")
  )
  assert.doesNotMatch(rollback, /needs:\s*classify/)
})

test("host deployment controller uses release fingerprints without Git history", () => {
  const controller = repositoryFile("ops/discord/bin/deploy-discord-release")

  assert.doesNotMatch(controller, /classifyChanges|git (?:diff|show|rev-parse)/)
  assert.match(controller, /release_manifest_value[\s\S]*commandFingerprint/)
  assert.match(controller, /COMMAND_FINGERPRINT/)
  assert.doesNotMatch(controller, /COMMAND_SHA|\.cleo-command-sha/)
  assert.doesNotMatch(controller, /source\s+"?\$state_file/)
  assert.match(controller, /read-discord-deployment-state/)
  assert.match(controller, /CLEO_DISCORD_HOST_NODE/)
  assert.match(controller, /buildTimestampPattern/)
  assert.match(controller, /currentStat\.isSymbolicLink\(\)/)
  assert.match(controller, /resolveRegularCriticalPath/)
  assert.match(controller, /regular non-symlink path components/)
})

test("workflow and installed controller enforce the same host contract", () => {
  const workflow = repositoryFile(".github/workflows/discord-production.yml")
  const controller = repositoryFile("ops/discord/bin/deploy-discord-release")
  const runnerCheck = repositoryFile("ops/discord/bin/check-discord-runner")
  const bootstrap = repositoryFile("ops/discord/bootstrap-host.sh")

  assert.match(workflow, /CLEO_DISCORD_HOST_CONTRACT_VERSION: "3"/)
  assert.match(controller, /controller_contract_version="3"/)
  assert.match(controller, /operation" == "contract-version"/)
  assert.match(runnerCheck, /deploy_controller contract-version/)
  assert.match(bootstrap, /trusted_node_version="v24\.15\.0"/)
assert.match(
  bootstrap,
  /trusted_node_archive="node-\$\{trusted_node_version\}-linux-arm64\.tar\.xz"/
)
  assert.match(
    bootstrap,
    /f3d5a797b5d210ce8e2cb265544c8e482eaedcb8aa409a8b46da7e8595d0dda0/
  )
  assert.match(bootstrap, /sha256sum -c -/)
  assert.match(bootstrap, /mktemp "\$libexec_dir\/\.node\.XXXXXX"/)
  assert.match(bootstrap, /mv -f -- "\$node_staging" "\$host_node"/)
  assert.doesNotMatch(bootstrap, /\/home\/cleo\/\.nvm/)
})

test("generated production outputs are ignored and untracked", () => {
  const gitignore = repositoryFile(".gitignore")
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })

  assert.match(gitignore, /^dist$/m)
  assert.match(gitignore, /^\*\.tar\.gz$/m)
  assert.match(gitignore, /^\*\.sha256$/m)
  assert.doesNotMatch(tracked, /(^|\/)dist\//m)
  assert.doesNotMatch(tracked, /(^|\/)node_modules\//m)
  assert.doesNotMatch(tracked, /\.(?:tar\.gz|sha256)$/m)
})
