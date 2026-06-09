import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assertDiscordSnowflake,
  assertGatewayEventTimestamp,
  assertGatewayGuild,
  assertGatewayShardScope,
  getDiscordGuildShardId,
  type GatewayGuild,
  uniqueGatewayGuilds,
} from "./gatewayGuild"

const nowMs = 1_700_000_000_000
const guildId = "123456789012345678"
const ownerDiscordId = "234567890123456789"

const validGuild: GatewayGuild = {
  discordGuildId: guildId,
  name: "Cleo HQ",
  description: "Community operations",
  iconUrl: "https://cdn.discordapp.com/icons/123/icon.png",
  iconHash: "icon-hash",
  ownerDiscordId,
  memberCount: 42,
  presenceCount: 7,
  botJoinedAt: nowMs - 1_000,
}

function assertConvexCode(callback: () => void, code: string): void {
  assert.throws(callback, (error) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "data" in error &&
      (error as { data?: { code?: string } }).data?.code === code
    )
  })
}

test("assertGatewayGuild accepts valid gateway guild metadata", () => {
  assert.doesNotThrow(() => assertGatewayGuild(validGuild, nowMs))
})

test("assertGatewayGuild rejects invalid snowflakes and metadata", () => {
  assertConvexCode(
    () =>
      assertGatewayGuild(
        {
          ...validGuild,
          discordGuildId: "bad",
        },
        nowMs
      ),
    "INVALID_DISCORD_SNOWFLAKE"
  )

  assertConvexCode(
    () =>
      assertGatewayGuild(
        {
          ...validGuild,
          iconUrl: "https://example.com/icon.png",
        },
        nowMs
      ),
    "INVALID_DISCORD_GUILD_METADATA"
  )

  assertConvexCode(
    () =>
      assertGatewayGuild(
        {
          ...validGuild,
          botJoinedAt: nowMs + 1,
        },
        nowMs
      ),
    "INVALID_DISCORD_GUILD_METADATA"
  )
})

test("gateway event timestamp validation allows small future skew only", () => {
  assert.doesNotThrow(() =>
    assertGatewayEventTimestamp("syncedAt", nowMs + 5 * 60 * 1_000, nowMs)
  )

  assertConvexCode(
    () =>
      assertGatewayEventTimestamp("syncedAt", nowMs + 5 * 60 * 1_000 + 1, nowMs),
    "INVALID_DISCORD_GUILD_EVENT_TIMESTAMP"
  )
})

test("gateway shard scope validation rejects impossible shard scopes", () => {
  assert.doesNotThrow(() =>
    assertGatewayShardScope({
      shardIds: [0, 1],
      shardCount: 2,
    })
  )

  assertConvexCode(
    () =>
      assertGatewayShardScope({
        shardIds: [1, 1],
        shardCount: 2,
      }),
    "INVALID_DISCORD_GATEWAY_SHARD_SCOPE"
  )

  assertConvexCode(
    () =>
      assertGatewayShardScope({
        shardIds: [2],
        shardCount: 2,
      }),
    "INVALID_DISCORD_GATEWAY_SHARD_SCOPE"
  )
})

test("Discord snowflake shard helper is deterministic", () => {
  assert.equal(
    getDiscordGuildShardId(guildId, 16),
    Number((BigInt(guildId) >> 22n) % 16n)
  )
  assert.equal(getDiscordGuildShardId("bad", 16), null)
  assert.equal(getDiscordGuildShardId(guildId, 0), null)
})

test("uniqueGatewayGuilds keeps the latest duplicate guild snapshot", () => {
  assert.deepEqual(
    uniqueGatewayGuilds([
      validGuild,
      {
        ...validGuild,
        discordGuildId: ownerDiscordId,
        name: "Second guild",
      },
      {
        ...validGuild,
        name: "Updated guild",
      },
    ]),
    [
      {
        ...validGuild,
        name: "Updated guild",
      },
      {
        ...validGuild,
        discordGuildId: ownerDiscordId,
        name: "Second guild",
      },
    ]
  )
})

test("assertDiscordSnowflake validates snowflake shape", () => {
  assert.doesNotThrow(() => assertDiscordSnowflake("discordGuildId", guildId))
  assertConvexCode(
    () => assertDiscordSnowflake("discordGuildId", "123"),
    "INVALID_DISCORD_SNOWFLAKE"
  )
})
