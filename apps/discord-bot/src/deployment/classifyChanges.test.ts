import assert from "node:assert/strict"
import { test } from "node:test"

import {
  classifyChangedPaths,
  isCommandRegistrationPath,
  isDiscordDeployPath,
} from "./classifyChanges"

test("Discord deploy paths include runtime and direct dependencies", () => {
  assert.equal(isDiscordDeployPath("apps/discord-bot/src/index.ts"), true)
  assert.equal(isDiscordDeployPath("packages/backend/convex/schema.ts"), false)
  assert.equal(isDiscordDeployPath("packages/shared/src/index.ts"), true)
  assert.equal(isDiscordDeployPath("pnpm-lock.yaml"), false)
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
  assert.deepEqual(
    classifyChangedPaths([
      "apps/dashboard/src/app/page.tsx",
      "pnpm-lock.yaml",
    ]),
    {
      deploy: false,
      registerCommands: false,
    }
  )
  assert.deepEqual(
    classifyChangedPaths(["apps/discord-bot/src/runtime/startup.ts"]),
    { deploy: true, registerCommands: false }
  )
})
