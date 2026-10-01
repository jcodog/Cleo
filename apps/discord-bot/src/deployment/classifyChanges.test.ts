import assert from "node:assert/strict"
import { test } from "node:test"

import {
  classifyChangedPaths,
  isCommandRegistrationPath,
  isDiscordDeployPath,
  isConvexDeployPath,
} from "./classifyChanges"

test("Convex classification includes imported packages, dependency resolution and build inputs", () => {
  for (const path of [
    "packages/backend/convex/http.ts",
    "packages/env/src/backend.ts",
    "packages/logger/src/index.ts",
    "packages/shared/src/providers.ts",
    "packages/typescript-config/base.json",
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "turbo.json",
    ".nvmrc",
    "convex.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "apps/dashboard/package.json",
    "packages/ui/package.json",
  ])
    assert.equal(isConvexDeployPath(path), true, path)
  for (const path of [
    "apps/dashboard/src/page.tsx",
    "ops/twitch/test.sh",
    "docs/twitch/bootstrap.md",
    "packages/ui/src/button.tsx",
    "tsconfig.json/other",
  ])
    assert.equal(isConvexDeployPath(path), false, path)
})

test("Discord deploy paths include runtime and direct dependencies", () => {
  assert.equal(isDiscordDeployPath("apps/discord-bot/src/index.ts"), true)
  assert.equal(isDiscordDeployPath("packages/backend/convex/schema.ts"), true)
  assert.equal(isDiscordDeployPath("packages/shared/src/index.ts"), true)
  assert.equal(isDiscordDeployPath("bun.lock"), true)
  assert.equal(isDiscordDeployPath("bunfig.toml"), true)
  assert.equal(isDiscordDeployPath("pnpm-lock.yaml"), false)
  assert.equal(isDiscordDeployPath("pnpm-workspace.yaml"), false)
  assert.equal(
    isDiscordDeployPath(".github/workflows/discord-production.yml"),
    true
  )
  assert.equal(
    isDiscordDeployPath(".github/scripts/check-discord-bundle-symlinks.sh"),
    true
  )
  assert.equal(
    isDiscordDeployPath(".github/scripts/package-discord-release.sh"),
    true
  )
  assert.equal(
    isDiscordDeployPath("ops/discord/bin/deploy-discord-release"),
    true
  )
  assert.equal(
    isDiscordDeployPath("ops/discord/bin/check-discord-runner"),
    true
  )
  assert.equal(isDiscordDeployPath("ops/discord/bin/run-discord-release"), true)
  assert.equal(isDiscordDeployPath("ops/discord/bootstrap-host.sh"), true)
  assert.equal(
    isDiscordDeployPath("ops/discord/systemd/cleo-discord.service"),
    true
  )
  assert.equal(
    isDiscordDeployPath(".github/workflows/discord-runner-smoke.yml"),
    false
  )
  assert.equal(isDiscordDeployPath("apps/dashboard/src/app/page.tsx"), false)
})

test("command registration paths exclude runtime-only changes", () => {
  assert.equal(
    isCommandRegistrationPath(
      "apps/discord-bot/src/handlers/commands/utility/ping.ts"
    ),
    true
  )
  assert.equal(
    isCommandRegistrationPath(
      "apps/discord-bot/src/scripts/registerCommands.ts"
    ),
    true
  )
  assert.equal(
    isCommandRegistrationPath("apps/discord-bot/src/runtime/startup.ts"),
    false
  )
  assert.equal(
    isCommandRegistrationPath("ops/discord/bin/run-discord-release"),
    false
  )
  assert.deepEqual(classifyChangedPaths(["apps/dashboard/src/app/page.tsx"]), {
    deploy: false,
    registerCommands: false,
  })
  assert.deepEqual(
    classifyChangedPaths([".github/workflows/discord-runner-smoke.yml"]),
    {
      deploy: false,
      registerCommands: false,
    }
  )
  assert.deepEqual(
    classifyChangedPaths(["apps/discord-bot/src/runtime/startup.ts"]),
    { deploy: true, registerCommands: false }
  )
  assert.deepEqual(
    classifyChangedPaths([
      "apps/discord-bot/src/handlers/commands/utility/ping.ts",
    ]),
    { deploy: true, registerCommands: true }
  )
})
