"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action, type ActionCtx } from "../../../../_generated/server"
import type { ReadyGuildInput } from "../../../../mutations/bot/discord/guilds/syncReadyBatch"
import { assertValidBotSecret } from "../lib/auth"
import {
  assertGatewayEventTimestamp,
  assertGatewayGuild,
  assertGatewayShardScope,
  gatewayGuild,
  gatewayShardScope,
  getDiscordGuildShardId,
  type GatewayGuild,
  type GatewayShardScope,
  uniqueGatewayGuilds,
} from "./lib/gatewayGuild"

// READY can contain thousands of guilds during reconnects. A batch size of 100
// keeps each Convex mutation bounded while avoiding an uncontrolled write burst.
export const READY_GUILD_BATCH_SIZE = 100
const RECONCILIATION_PAGE_SIZE = 100

type ReadyShardReconciliationPage = {
  continueCursor: string
  isDone: boolean
  scanned: number
  markedLeft: number
  skipped: number
}

export const sync = action({
  args: {
    secret: v.string(),
    guilds: v.array(gatewayGuild),
    shardScope: gatewayShardScope,
    syncedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    const now = Date.now()
    const syncedAt = args.syncedAt
    const guilds = uniqueGatewayGuilds(args.guilds)

    assertGatewayEventTimestamp("syncedAt", syncedAt, now)
    assertGatewayShardScope(args.shardScope)

    for (const guild of guilds) {
      assertGatewayGuild(guild, now)
    }

    const readyGuilds = createReadyGuildInputs(guilds, args.shardScope)

    for (const batch of chunkReadyGuilds(readyGuilds)) {
      await ctx.runMutation(
        internal.mutations.bot.discord.guilds.syncReadyBatch.sync,
        {
          guilds: batch,
          lastSyncedAt: syncedAt,
        }
      )
    }

    await reconcileAbsentReadyGuilds({
      ctx,
      readyDiscordGuildIds: new Set(
        guilds.map((guild) => guild.discordGuildId)
      ),
      shardScope: args.shardScope,
      syncedAt,
    })

    return null
  },
})

async function reconcileAbsentReadyGuilds({
  ctx,
  readyDiscordGuildIds,
  shardScope,
  syncedAt,
}: {
  ctx: ActionCtx
  readyDiscordGuildIds: Set<string>
  shardScope: GatewayShardScope
  syncedAt: number
}) {
  const readyDiscordGuildIdList = Array.from(readyDiscordGuildIds)

  for (const shardId of shardScope.shardIds) {
    const readyShardKey = createReadyShardKey(shardScope.shardCount, shardId)
    let cursor: string | null = null

    while (true) {
      const page: ReadyShardReconciliationPage = await ctx.runMutation(
        internal.mutations.bot.discord.guilds.markBotLeftBatch
          .markAbsentForReadyShardPage,
        {
          readyShardKey,
          readyDiscordGuildIds: readyDiscordGuildIdList,
          leftAt: syncedAt,
          paginationOpts: {
            cursor,
            numItems: RECONCILIATION_PAGE_SIZE,
            maximumRowsRead: RECONCILIATION_PAGE_SIZE,
          },
        }
      )

      if (page.isDone) {
        break
      }

      cursor = page.continueCursor
    }
  }
}

export function createReadyGuildInputs(
  guilds: GatewayGuild[],
  shardScope: GatewayShardScope
): ReadyGuildInput[] {
  const handledShardIds = new Set(shardScope.shardIds)

  return guilds.map((guild) => {
    const readyShardId = getDiscordGuildShardId(
      guild.discordGuildId,
      shardScope.shardCount
    )

    if (readyShardId === null || !handledShardIds.has(readyShardId)) {
      throw new Error(
        `Guild ${guild.discordGuildId} is outside the handled READY shard scope.`
      )
    }

    return {
      ...guild,
      readyShardId,
      readyShardCount: shardScope.shardCount,
      readyShardKey: createReadyShardKey(shardScope.shardCount, readyShardId),
    }
  })
}

export function chunkReadyGuilds<T>(
  values: T[],
  batchSize = READY_GUILD_BATCH_SIZE
): T[][] {
  const batches: T[][] = []

  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize))
  }

  return batches
}

export function createReadyShardKey(shardCount: number, shardId: number): string {
  // Include shardCount so reconciliation only marks absences for the topology
  // represented by the current READY snapshot.
  return `${shardCount}:${shardId}`
}
