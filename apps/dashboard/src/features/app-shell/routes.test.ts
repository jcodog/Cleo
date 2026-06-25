import assert from "node:assert/strict"
import { test } from "node:test"

import { getAppShellAreaFromPathname, getRouteDiscordGuildId } from "./routes"

test("dashboard route parser only infers actual Discord guild workspace IDs", () => {
  assert.equal(getRouteDiscordGuildId("/dashboard"), undefined)
  assert.equal(getRouteDiscordGuildId("/dashboard/add-server"), undefined)
  assert.equal(getRouteDiscordGuildId("/dashboard/staff"), undefined)
  assert.equal(
    getRouteDiscordGuildId("/staff/discord-runtime-incidents"),
    undefined
  )
  assert.equal(
    getRouteDiscordGuildId("/dashboard/123456789012345678"),
    "123456789012345678"
  )
  assert.equal(
    getRouteDiscordGuildId("/dashboard/123456789012345678/logs"),
    "123456789012345678"
  )
})

test("staff routes use the staff app shell area", () => {
  assert.equal(getAppShellAreaFromPathname("/staff"), "staff")
  assert.equal(
    getAppShellAreaFromPathname("/staff/discord-runtime-incidents"),
    "staff"
  )
  assert.equal(getAppShellAreaFromPathname("/dashboard"), "discord")
})
