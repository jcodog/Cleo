import assert from "node:assert/strict"
import test from "node:test"

import {
  getLastDiscordGuildDashboardPath,
  serializeLastDiscordGuildPreference,
} from "./lastGuildPreference"

const USER_ID = "user_2abc123"
const GUILD_ID = "123456789012345678"

test("restores the last guild for the same signed-in user", () => {
  const cookieValue = serializeLastDiscordGuildPreference({
    guildId: GUILD_ID,
    userId: USER_ID,
  })

  assert.equal(
    getLastDiscordGuildDashboardPath(cookieValue, USER_ID),
    `/dashboard/${GUILD_ID}`
  )
})

test("does not reuse another user's last guild", () => {
  const cookieValue = serializeLastDiscordGuildPreference({
    guildId: GUILD_ID,
    userId: "user_someone_else",
  })

  assert.equal(
    getLastDiscordGuildDashboardPath(cookieValue, USER_ID),
    "/dashboard"
  )
})

test("falls back safely for missing or malformed preferences", () => {
  assert.equal(getLastDiscordGuildDashboardPath(undefined, USER_ID), "/dashboard")
  assert.equal(
    getLastDiscordGuildDashboardPath("not-json", USER_ID),
    "/dashboard"
  )

  const invalidGuild = serializeLastDiscordGuildPreference({
    guildId: "not-a-discord-guild",
    userId: USER_ID,
  })

  assert.equal(
    getLastDiscordGuildDashboardPath(invalidGuild, USER_ID),
    "/dashboard"
  )
})
