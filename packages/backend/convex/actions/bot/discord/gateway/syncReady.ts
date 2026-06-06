"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action, type ActionCtx } from "../../../../_generated/server"
import { assertValidBotSecret } from "./lib/auth"
import {
  assertGatewayEventTimestamp,
  assertGatewayGuild,
  assertGatewayShardScope,
  gatewayShardScope,
  getDiscordGuildShardId,
  gatewayGuild,
  type GatewayShardScope,
  uniqueGatewayGuilds,
} from "./lib/gatewayGuild"

const RECONCILIATION_PAGE_SIZE = 100

type ReadyReconciliationPage = {
  page: {
    discordGuildId: string
    botLeftAt?: number
  }[]
  continueCursor: string
  isDone: boolean
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

    for (const guild of guilds) {
      const guildId = await ctx.runMutation(
        internal.mutations.bot.discord.guilds.upsertFromGateway.upsert,
        {
          ...guild,
          lastSyncedAt: syncedAt,
        }
      )

      await ctx.runMutation(
        internal.mutations.bot.discord.guildConfigs.ensure.forGuild,
        { guildId }
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
  const handledShardIds = new Set(shardScope.shardIds)
  let cursor: string | null = null

  while (true) {
    const guildsPage: ReadyReconciliationPage = await ctx.runQuery(
      internal.queries.bot.discord.guilds.readyReconciliation.listPage,
      {
        paginationOpts: {
          cursor,
          numItems: RECONCILIATION_PAGE_SIZE,
          maximumRowsRead: RECONCILIATION_PAGE_SIZE,
        },
      }
    )

    for (const guild of guildsPage.page) {
      if (
        guild.botLeftAt !== undefined ||
        readyDiscordGuildIds.has(guild.discordGuildId) ||
        !isGuildInShardScope(guild.discordGuildId, shardScope, handledShardIds)
      ) {
        continue
      }

      await ctx.runMutation(
        internal.mutations.bot.discord.guilds.markBotLeft.mark,
        {
          discordGuildId: guild.discordGuildId,
          leftAt: syncedAt,
        }
      )
    }

    if (guildsPage.isDone) {
      break
    }

    cursor = guildsPage.continueCursor
  }
}

function isGuildInShardScope(
  discordGuildId: string,
  shardScope: GatewayShardScope,
  handledShardIds: Set<number>
): boolean {
  const shardId = getDiscordGuildShardId(
    discordGuildId,
    shardScope.shardCount
  )

  return shardId !== null && handledShardIds.has(shardId)
}
