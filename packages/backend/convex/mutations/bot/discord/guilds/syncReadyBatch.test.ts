import assert from "node:assert/strict"
import { test } from "node:test"

import type { Doc } from "../../../../_generated/dataModel"
import { getReadyGuildPatch, type ReadyGuildInput } from "./syncReadyBatch"

type ExistingGuild = Parameters<typeof getReadyGuildPatch>[0]

const existingGuild = {
  name: "Cleo HQ",
  description: "Original",
  iconUrl: "https://cdn.discordapp.com/icons/1/a.png",
  iconHash: "a",
  ownerDiscordId: "111111111111111111",
  memberCount: 10,
  presenceCount: 5,
  botJoinedAt: 1_000,
  lastSyncedAt: 2_000,
  readyShardId: 1,
  readyShardCount: 16,
  readyShardKey: "16:1",
} satisfies ExistingGuild

const readyGuild = {
  discordGuildId: "123456789012345678",
  name: "Cleo HQ",
  description: "Original",
  iconUrl: "https://cdn.discordapp.com/icons/1/a.png",
  iconHash: "a",
  ownerDiscordId: "111111111111111111",
  memberCount: 10,
  presenceCount: 5,
  botJoinedAt: 1_000,
  readyShardId: 1,
  readyShardCount: 16,
  readyShardKey: "16:1",
} satisfies ReadyGuildInput

test("READY patch updates changed present guild metadata", () => {
  assert.deepEqual(
    getReadyGuildPatch(
      {
        ...existingGuild,
        botLeftAt: 2_100,
      },
      {
        ...readyGuild,
        name: "Cleo Support",
        memberCount: 12,
      },
      { lastSyncedAt: 2_200, now: 3_000 }
    ),
    {
      name: "Cleo Support",
      memberCount: 12,
      botLeftAt: undefined,
      lastSyncedAt: 2_200,
      updatedAt: 3_000,
    }
  )
})

test("READY patch skips unchanged repeated snapshots", () => {
  assert.equal(
    getReadyGuildPatch(existingGuild, readyGuild, {
      lastSyncedAt: existingGuild.lastSyncedAt,
      now: 3_000,
    }),
    null
  )
})

test("READY patch does not resurrect a later guild leave", () => {
  assert.equal(
    getReadyGuildPatch(
      {
        ...existingGuild,
        botLeftAt: 2_500,
        lastSyncedAt: 2_500,
      },
      readyGuild,
      { lastSyncedAt: 2_500, now: 3_000 }
    ),
    "stale"
  )
})

test("READY patch records shard-count changes without touching old shard scopes", () => {
  assert.deepEqual(
    getReadyGuildPatch(
      existingGuild,
      {
        ...readyGuild,
        readyShardId: 3,
        readyShardCount: 32,
        readyShardKey: "32:3",
      },
      { lastSyncedAt: 2_200, now: 3_000 }
    ),
    {
      readyShardId: 3,
      readyShardCount: 32,
      readyShardKey: "32:3",
      lastSyncedAt: 2_200,
      updatedAt: 3_000,
    }
  )
})

test("READY patch preserves absent optional fields when Discord omits them", () => {
  const incomingWithoutOptionalFields = {
    discordGuildId: "123456789012345678",
    name: "Cleo HQ",
    readyShardId: 1,
    readyShardCount: 16,
    readyShardKey: "16:1",
  } satisfies ReadyGuildInput

  assert.equal(
    getReadyGuildPatch(existingGuild, incomingWithoutOptionalFields, {
      lastSyncedAt: 2_000,
      now: 3_000,
    }),
    null
  )
})

test("READY patch type remains aligned with the guild document", () => {
  const patch = getReadyGuildPatch(existingGuild, readyGuild, {
    lastSyncedAt: 2_001,
    now: 3_000,
  })

  assert.deepEqual(patch, {
    lastSyncedAt: 2_001,
    updatedAt: 3_000,
  } satisfies Partial<Doc<"guilds">>)
})
