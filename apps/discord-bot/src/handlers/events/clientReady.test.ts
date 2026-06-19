import assert from "node:assert/strict"
import { test } from "node:test"

import type { GuildSnapshot } from "@/utils/createGuildSnapshot"

import { handleClientReady } from "./clientReady"

type SyncReadyCall = {
  guilds: GuildSnapshot[]
  options: {
    shardScope: {
      shardIds: number[]
      shardCount: number
    }
    syncedAt: number
  }
}

function createGuild(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "123456789012345678",
    name: "Cleo HQ",
    description: null,
    iconURL: () => null,
    icon: null,
    ownerId: "222222222222222222",
    memberCount: 42,
    joinedTimestamp: 1_000,
    ...overrides,
  }
}

function createClient(guilds = [createGuild()]) {
  return {
    user: {
      tag: "Cleo#0001",
    },
    guilds: {
      cache: new Map(guilds.map((guild) => [guild.id, guild])),
    },
    shard: {
      ids: [2],
      count: 8,
    },
  }
}

test("clientReady logs ready state and syncs guild snapshots to Convex", async () => {
  const calls: SyncReadyCall[] = []
  const logs: string[] = []

  await handleClientReady(createClient() as never, {
    now: () => 5_000,
    log: (message) => {
      logs.push(message)
    },
    convexClient: {
      async syncReadyGuilds(guilds, options) {
        calls.push({ guilds, options })
      },
    },
  })

  assert.deepEqual(logs, [
    "Cleo is online as Cleo#0001",
    "Connected to 1 guild(s).",
    "READY sync shard scope: ids=2; count=8.",
    "Guild available: Cleo HQ (123456789012345678) with 42 member(s).",
  ])
  assert.deepEqual(calls, [
    {
      guilds: [
        {
          discordGuildId: "123456789012345678",
          name: "Cleo HQ",
          ownerDiscordId: "222222222222222222",
          memberCount: 42,
          botJoinedAt: 1_000,
        },
      ],
      options: {
        shardScope: {
          shardIds: [2],
          shardCount: 8,
        },
        syncedAt: 5_000,
      },
    },
  ])
})

test("clientReady catches Convex sync failures", async () => {
  const loggedErrors: unknown[] = []

  await assert.doesNotReject(async () => {
    await handleClientReady(createClient() as never, {
      log: () => undefined,
      convexClient: {
        async syncReadyGuilds() {
          throw new Error("Convex unavailable")
        },
      },
      logError: (message, error) => {
        loggedErrors.push({ message, error })
      },
    })
  })

  assert.equal(loggedErrors.length, 1)
  assert.equal(
    (loggedErrors[0] as { message: string }).message,
    "Unexpected Convex ready guild sync failure."
  )
  assert.ok((loggedErrors[0] as { error: unknown }).error instanceof Error)
})
