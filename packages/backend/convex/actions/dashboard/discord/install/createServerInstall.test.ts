import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildDiscordInstallUrl,
  DEFAULT_DISCORD_BOT_PERMISSIONS,
  resolveDiscordBotPermissions,
} from "./createServerInstall"

test("uses the reviewed Cleo Discord permission envelope", () => {
  assert.equal(DEFAULT_DISCORD_BOT_PERMISSIONS, "5068182071536887")
})

test("builds a callback-free Discord guild install URL", () => {
  const installUrl = new URL(
    buildDiscordInstallUrl({
      discordApplicationId: "application-id",
      discordBotPermissions: DEFAULT_DISCORD_BOT_PERMISSIONS,
      discordGuildId: "guild-id",
    })
  )

  assert.equal(installUrl.origin, "https://discord.com")
  assert.equal(installUrl.pathname, "/oauth2/authorize")

  assert.equal(installUrl.searchParams.get("client_id"), "application-id")
  assert.equal(
    installUrl.searchParams.get("scope"),
    "bot applications.commands"
  )
  assert.equal(
    installUrl.searchParams.get("permissions"),
    DEFAULT_DISCORD_BOT_PERMISSIONS
  )
  assert.equal(installUrl.searchParams.get("guild_id"), "guild-id")
  assert.equal(installUrl.searchParams.get("disable_guild_select"), "true")
  assert.equal(installUrl.searchParams.get("integration_type"), "0")

  assert.equal(installUrl.searchParams.get("state"), null)
  assert.equal(installUrl.searchParams.get("redirect_uri"), null)
  assert.equal(installUrl.searchParams.get("response_type"), null)
})

test("uses the reviewed Discord v3 permission set when no override exists", () => {
  assert.equal(
    resolveDiscordBotPermissions(undefined),
    DEFAULT_DISCORD_BOT_PERMISSIONS
  )
  assert.equal(
    resolveDiscordBotPermissions(""),
    DEFAULT_DISCORD_BOT_PERMISSIONS
  )
  assert.equal(
    resolveDiscordBotPermissions("not-a-bitfield"),
    DEFAULT_DISCORD_BOT_PERMISSIONS
  )
})

test("normalizes a valid decimal permission override without number precision loss", () => {
  assert.equal(
    resolveDiscordBotPermissions(" 000309237894150 "),
    "309237894150"
  )
  assert.equal(
    resolveDiscordBotPermissions("999999999999999999999999999999"),
    "999999999999999999999999999999"
  )
  assert.equal(resolveDiscordBotPermissions("0"), "0")
})
