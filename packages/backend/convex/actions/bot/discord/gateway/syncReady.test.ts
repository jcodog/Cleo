import assert from "node:assert/strict"
import { test } from "node:test"

import {
  chunkReadyGuilds,
  createReadyGuildInputs,
  createReadyShardKey,
  reconcileAbsentReadyGuilds,
  READY_GUILD_BATCH_SIZE,
} from "./syncReady"
import { getDiscordGuildShardId, type GatewayGuild } from "./lib/gatewayGuild"

const guild = {
  discordGuildId: "123456789012345678",
  name: "Cleo HQ",
  memberCount: 42,
} satisfies GatewayGuild

test("READY guilds are split into bounded batches", () => {
  const values = Array.from(
    { length: READY_GUILD_BATCH_SIZE * 2 + 1 },
    (_, index) => index
  )

  assert.deepEqual(
    chunkReadyGuilds(values).map((batch) => batch.length),
    [READY_GUILD_BATCH_SIZE, READY_GUILD_BATCH_SIZE, 1]
  )
})

test("READY guild inputs include shard membership metadata", () => {
  const shardCount = 16
  const shardId = getDiscordGuildShardId(guild.discordGuildId, shardCount)

  assert.notEqual(shardId, null)

  const [readyGuild] = createReadyGuildInputs([guild], {
    shardIds: [shardId ?? 0],
    shardCount,
  })

  assert.deepEqual(readyGuild, {
    ...guild,
    readyShardId: shardId,
    readyShardCount: shardCount,
    readyShardKey: createReadyShardKey(shardCount, shardId ?? 0),
  })
})

test("READY guild input creation rejects guilds outside handled shard scope", () => {
  const shardCount = 16
  const shardId = getDiscordGuildShardId(guild.discordGuildId, shardCount)
  const otherShardId = shardId === 0 ? 1 : 0

  assert.throws(
    () =>
      createReadyGuildInputs([guild], {
        shardIds: [otherShardId],
        shardCount,
      }),
    /outside the handled READY shard scope/
  )
})

test("READY shard keys define shard-count change behavior", () => {
  assert.equal(createReadyShardKey(16, 4), "16:4")
  assert.equal(createReadyShardKey(32, 4), "32:4")
  assert.notEqual(createReadyShardKey(16, 4), createReadyShardKey(32, 4))
})

test("READY reconciliation pages do not receive the full READY guild snapshot", async () => {
  const calls: unknown[] = []
  const ctx = {
    async runMutation(_mutation: unknown, args: unknown) {
      calls.push(args)

      return {
        continueCursor: calls.length === 1 ? "next" : "",
        isDone: calls.length === 2,
        scanned: 100,
        markedLeft: 1,
        skipped: 99,
      }
    },
  }

  await reconcileAbsentReadyGuilds({
    ctx: ctx as never,
    shardScope: {
      shardIds: [3],
      shardCount: 16,
    },
    syncedAt: 5_000,
  })

  assert.deepEqual(calls, [
    {
      readyShardKey: "16:3",
      leftAt: 5_000,
      paginationOpts: {
        cursor: null,
        numItems: 100,
        maximumRowsRead: 100,
      },
    },
    {
      readyShardKey: "16:3",
      leftAt: 5_000,
      paginationOpts: {
        cursor: "next",
        numItems: 100,
        maximumRowsRead: 100,
      },
    },
  ])

  for (const call of calls) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(call, "readyDiscordGuildIds"),
      false
    )
  }
})
