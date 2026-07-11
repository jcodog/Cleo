import assert from "node:assert/strict"
import { test } from "node:test"

import type { Guild } from "discord.js"

import { convexBotClient } from "@/services/convexBotClient"

import guildDelete from "./guildDelete"

function createGuild(): Guild {
  return {
    id: "123456789012345678",
    name: "Cleo HQ",
  } as Guild
}

test("guildDelete syncs the guild leave snapshot", async (t) => {
  const calls: unknown[] = []
  const originalSync = convexBotClient.syncGuildLeft

  t.mock.method(console, "log", () => undefined)
  convexBotClient.syncGuildLeft = async (snapshot) => {
    calls.push(snapshot)
  }
  t.after(() => {
    convexBotClient.syncGuildLeft = originalSync
  })

  await guildDelete.execute(createGuild())
  const snapshot = calls[0] as {
    discordGuildId: string
    name: string
    leftAt: number
  }
  assert.equal(calls.length, 1)
  assert.equal(snapshot.discordGuildId, "123456789012345678")
  assert.equal(snapshot.name, "Cleo HQ")
  assert.ok(Number.isSafeInteger(snapshot.leftAt))
})

test("guildDelete catches backend sync failures", async (t) => {
  const originalSync = convexBotClient.syncGuildLeft
  const errorLines: string[] = []

  t.mock.method(console, "log", () => undefined)
  t.mock.method(console, "error", (line: string) => errorLines.push(line))
  convexBotClient.syncGuildLeft = async () => {
    throw new Error("backend unavailable")
  }
  t.after(() => {
    convexBotClient.syncGuildLeft = originalSync
  })

  await assert.doesNotReject(async () => guildDelete.execute(createGuild()))
  assert.match(errorLines.join("\n"), /guild leave sync failure/)
})
