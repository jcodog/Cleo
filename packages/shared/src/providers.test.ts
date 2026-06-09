import assert from "node:assert/strict"
import { test } from "node:test"

import { DISCORD_VERIFICATION_SOURCES, LINKED_PROVIDERS } from "./providers"

test("linked providers include primary and secondary auth providers", () => {
  assert.equal(LINKED_PROVIDERS[0], "discord")
  assert.ok(LINKED_PROVIDERS.includes("kick"))
  assert.ok(LINKED_PROVIDERS.includes("twitch"))
  assert.equal(new Set(LINKED_PROVIDERS).size, LINKED_PROVIDERS.length)
})

test("discord verification sources remain unique", () => {
  assert.ok(DISCORD_VERIFICATION_SOURCES.includes("discord-bot"))
  assert.ok(DISCORD_VERIFICATION_SOURCES.includes("discord-oauth"))
  assert.ok(DISCORD_VERIFICATION_SOURCES.includes("manual"))
  assert.equal(
    new Set(DISCORD_VERIFICATION_SOURCES).size,
    DISCORD_VERIFICATION_SOURCES.length
  )
})
