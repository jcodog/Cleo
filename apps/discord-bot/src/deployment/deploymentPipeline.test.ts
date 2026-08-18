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
  assert.doesNotMatch(
    packager,
    /bun run --filter @workspace\/discord-bot build/
  )
  assert.match(packager, /Validated Discord build output is missing/)
  assert.match(packager, /Packaging mutated the validated Discord build output/)
  assert.match(
    packager,
    /Packaged Discord build differs from the validated build output/
  )
  assert.match(workflow, /runs-on: ubuntu-24\.04/)
  assert.doesNotMatch(workflow, /runs-on: ubuntu-24\.04-arm/)
  assert.match(workflow, /process\.platform.*process\.arch.*linux-x64/)
  assert.match(packager, /release_platform.*linux-x64/)
  assert.match(
    repositoryFile("apps/discord-bot/runtime-artifact.json"),
    /canvas-linux-x64-gnu\/skia\.linux-x64-gnu\.node/
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
    assert.match(
      job,
      /\/usr\/local\/libexec\/cleo\/read-discord-deployment-state/
    )
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
  assert.match(controller, /release root escapes the releases directory/)
  assert.match(controller, /runtimeEntrypoint: "dist\/index\.js"/)
  assert.match(controller, /manifest\.nodeVersion !== process\.versions\.node/)
})

test("workflow and installed controller enforce the same host contract", () => {
  const workflow = repositoryFile(".github/workflows/discord-production.yml")
  const smokeWorkflow = repositoryFile(
    ".github/workflows/discord-runner-smoke.yml"
  )
  const controller = repositoryFile("ops/discord/bin/deploy-discord-release")
  const runnerCheck = repositoryFile("ops/discord/bin/check-discord-runner")
  const bootstrap = repositoryFile("ops/discord/bootstrap-host.sh")

  assert.match(workflow, /CLEO_DISCORD_HOST_CONTRACT_VERSION: "4"/)
  assert.match(smokeWorkflow, /CLEO_DISCORD_HOST_CONTRACT_VERSION: "4"/)
  assert.match(controller, /controller_contract_version="4"/)
  assert.match(controller, /operation" == "contract-version"/)
  assert.match(runnerCheck, /deploy_controller contract-version/)
  assert.match(bootstrap, /trusted_node_version="v24\.15\.0"/)
  assert.match(
    bootstrap,
    /trusted_node_archive="node-\$\{trusted_node_version\}-linux-x64\.tar\.xz"/
  )
  assert.match(
    bootstrap,
    /472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6/
  )
  assert.match(bootstrap, /process\.platform.*process\.arch.*linux-x64/)
  assert.match(bootstrap, /sha256sum -c -/)
  assert.match(bootstrap, /mktemp "\$libexec_dir\/\.node\.XXXXXX"/)
  assert.match(bootstrap, /mv -fT -- "\$node_staging" "\$host_node"/)
  assert.match(
    bootstrap,
    /Discord host Node path is not a regular non-symlink file/
  )
  assert.match(
    bootstrap,
    /Installed Discord host Node is not a root-owned regular executable/
  )
  assert.doesNotMatch(bootstrap, /\/home\/cleo\/\.nvm/)
  assert.match(runnerCheck, /expected_platform" == "linux-x64"/)
  assert.match(workflow, /CLEO_DISCORD_RELEASE_PLATFORM: linux-x64/)
  assert.match(smokeWorkflow, /CLEO_DISCORD_RELEASE_PLATFORM: linux-x64/)
  assert.match(
    smokeWorkflow,
    /sudo -n -u "\$CLEO_DISCORD_RUNTIME_USER"[\s\S]*check-discord-runtime/
  )
})

test("application runtime and command registration remain on Cleo NVM", () => {
  const launcher = repositoryFile("ops/discord/bin/run-discord-release")

  assert.match(launcher, /\/home\/cleo\/\.nvm\/nvm-exec/)
  assert.match(
    launcher,
    /exec "\$nvm_exec" node --enable-source-maps "\$compiled_entrypoint"/
  )
})

test("runtime identity can read releases without writing deployment state", () => {
  const bootstrap = repositoryFile("ops/discord/bootstrap-host.sh")
  const controller = repositoryFile("ops/discord/bin/deploy-discord-release")
  const runnerCheck = repositoryFile("ops/discord/bin/check-discord-runner")
  const runtimeUnit = repositoryFile("ops/discord/systemd/cleo-discord.service")
  const commandUnit = repositoryFile(
    "ops/discord/systemd/cleo-discord-register-commands.service"
  )
  const sudoers = repositoryFile("ops/discord/sudoers/cleo-discord-deploy")

  assert.match(bootstrap, /runtime_read_group="cleo-runtime"/)
  assert.match(bootstrap, /usermod -aG "\$runtime_read_group" "\$runtime_user"/)
  assert.match(bootstrap, /gpasswd -d "\$runtime_user" "\$deploy_group"/)
  assert.doesNotMatch(bootstrap, /usermod -aG cleo-deploy cleo/)
  assert.match(controller, /seal_release_permissions/)
  assert.match(controller, /chgrp -hR "\$runtime_read_group"/)
  assert.match(bootstrap, /-type d -exec chmod a-s,a-t/)
  assert.match(controller, /-type d -exec chmod a-s,a-t/)
  assert.match(controller, /-type d -exec chmod 0750/)
  assert.match(bootstrap, /-type f -exec chmod a-s,a-t/)
  assert.match(controller, /-type f -exec chmod a-s,a-t/)
  assert.match(controller, /-type f -exec chmod 0640/)
  assert.match(runtimeUnit, /SupplementaryGroups=cleo-runtime/)
  assert.match(commandUnit, /SupplementaryGroups=cleo-runtime/)
  assert.doesNotMatch(runtimeUnit, /SupplementaryGroups=cleo-deploy/)
  assert.doesNotMatch(commandUnit, /SupplementaryGroups=cleo-deploy/)
  assert.match(runnerCheck, /must not be a member of \$deploy_group/)
  assert.match(
    runnerCheck,
    /sudo -n -u "\$runtime_user" \/usr\/bin\/test -w "\$directory"/
  )
  for (const path of [
    "/srv/cleo/discord-bot",
    "/srv/cleo/discord-bot/releases",
    "/srv/cleo/discord-bot/shared",
    "/srv/cleo/discord-bot/shared/deployment.lock",
    "/srv/cleo/discord-bot/shared/deployment-state.env",
    "/srv/cleo/discord-bot/current",
  ]) {
    assert.match(sudoers, new RegExp(`/usr/bin/test -w ${path}`))
  }
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
