import assert from "node:assert/strict"
import { test } from "node:test"

import type { Guild } from "discord.js"

import { convexBotClient } from "@/services/convexBotClient"

import guildCreate from "./guildCreate"

function createGuild(): Guild {
  return {
    id: "123456789012345678",
    name: "Cleo HQ",
    description: null,
    iconURL: () => null,
    icon: null,
    ownerId: "234567890123456789",
    memberCount: 42,
    joinedTimestamp: 1_000,
  } as unknown as Guild
}

test("guildCreate syncs the joined guild snapshot", async (t) => {
  const calls: unknown[] = []
  const originalSync = convexBotClient.syncGuildJoined

  t.mock.method(console, "log", () => undefined)
  convexBotClient.syncGuildJoined = async (snapshot, syncedAt) => {
    calls.push({ snapshot, syncedAt })
  }
  t.after(() => {
    convexBotClient.syncGuildJoined = originalSync
  })

  await guildCreate.execute(createGuild())

  assert.equal(calls.length, 1)
  assert.deepEqual((calls[0] as { snapshot: unknown }).snapshot, {
    discordGuildId: "123456789012345678",
    name: "Cleo HQ",
    ownerDiscordId: "234567890123456789",
    memberCount: 42,
    botJoinedAt: 1_000,
  })
  assert.ok(Number.isSafeInteger((calls[0] as { syncedAt: number }).syncedAt))
})

test("guildCreate catches backend sync failures", async (t) => {
  const originalSync = convexBotClient.syncGuildJoined
  const errorLines: string[] = []

  t.mock.method(console, "log", () => undefined)
  t.mock.method(console, "error", (line: string) => errorLines.push(line))
  convexBotClient.syncGuildJoined = async () => {
    throw new Error("backend unavailable")
  }
  t.after(() => {
    convexBotClient.syncGuildJoined = originalSync
  })

  await assert.doesNotReject(async () => guildCreate.execute(createGuild()))
  assert.match(errorLines.join("\n"), /guild join sync failure/)
})
