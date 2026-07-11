import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_DISCORD_BOT_PERMISSIONS,
  resolveDiscordBotPermissions,
} from "./createServerInstall"

test("uses the reviewed Discord v3 permission set when no override exists", () => {
  assert.equal(
    resolveDiscordBotPermissions(undefined),
    DEFAULT_DISCORD_BOT_PERMISSIONS
  )
  assert.equal(resolveDiscordBotPermissions(""), DEFAULT_DISCORD_BOT_PERMISSIONS)
  assert.equal(
    resolveDiscordBotPermissions("not-a-bitfield"),
    DEFAULT_DISCORD_BOT_PERMISSIONS
  )
})

test("normalizes a valid decimal permission override without number precision loss", () => {
  assert.equal(resolveDiscordBotPermissions(" 000309237894150 "), "309237894150")
  assert.equal(
    resolveDiscordBotPermissions("999999999999999999999999999999"),
    "999999999999999999999999999999"
  )
  assert.equal(resolveDiscordBotPermissions("0"), "0")
})
