import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"

import { internalMutation } from "../../../../_generated/server"

const MAX_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000

type ReadyShardGuild = {
  discordGuildId: string
  botJoinedAt?: number
  botInstallationVerifiedAt?: number
  botLeftAt?: number
  lastSyncedAt?: number
}

export const mark = internalMutation({
  args: {
    discordGuildIds: v.array(v.string()),
    leftAt: v.number(),
  },
  returns: v.object({
    requested: v.number(),
    markedLeft: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const leftAt = normalizeLeftAt(args.leftAt, now)
    let markedLeft = 0
    let skipped = 0

    for (const discordGuildId of args.discordGuildIds) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discord_guild_id", (q) =>
          q.eq("discordGuildId", discordGuildId)
        )
        .unique()

      if (!guild) {
        skipped += 1
        continue
      }

      const latestPresenceAt = Math.max(
        guild.botJoinedAt ?? 0,
        guild.botInstallationVerifiedAt ?? 0,
        guild.lastSyncedAt ?? 0
      )

      if (guild.botLeftAt !== undefined || leftAt <= latestPresenceAt) {
        skipped += 1
        continue
      }

      await ctx.db.patch(guild._id, {
        botLeftAt: leftAt,
        lastSyncedAt: leftAt,
        updatedAt: now,
      })
      markedLeft += 1
    }

    return {
      requested: args.discordGuildIds.length,
      markedLeft,
      skipped,
    }
  },
})

export const markAbsentForReadyShardPage = internalMutation({
  args: {
    readyShardKey: v.string(),
    leftAt: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    scanned: v.number(),
    markedLeft: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const leftAt = normalizeLeftAt(args.leftAt, now)
    let markedLeft = 0
    let skipped = 0

    const page = await ctx.db
      .query("guilds")
      .withIndex("by_ready_shard_key", (q) =>
        q.eq("readyShardKey", args.readyShardKey)
      )
      .paginate(args.paginationOpts)

    for (const guild of page.page) {
      if (!shouldMarkReadyShardGuildAbsent(guild, leftAt)) {
        skipped += 1
        continue
      }

      await ctx.db.patch(guild._id, {
        botLeftAt: leftAt,
        lastSyncedAt: leftAt,
        updatedAt: now,
      })
      markedLeft += 1
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scanned: page.page.length,
      markedLeft,
      skipped,
    }
  },
})

export const markAbsentForReadyScopePage = internalMutation({
  args: {
    shardIds: v.array(v.number()),
    shardCount: v.number(),
    leftAt: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    scanned: v.number(),
    markedLeft: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const leftAt = normalizeLeftAt(args.leftAt, now)
    const handledShardIds = new Set(args.shardIds)
    let markedLeft = 0
    let skipped = 0
    const page = await ctx.db.query("guilds").paginate(args.paginationOpts)

    for (const guild of page.page) {
      const shardId = getGuildShardId(guild.discordGuildId, args.shardCount)

      if (
        shardId === null ||
        !handledShardIds.has(shardId) ||
        !shouldMarkReadyShardGuildAbsent(guild, leftAt)
      ) {
        skipped += 1
        continue
      }

      await ctx.db.patch(guild._id, {
        botLeftAt: leftAt,
        lastSyncedAt: leftAt,
        updatedAt: now,
      })
      markedLeft += 1
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scanned: page.page.length,
      markedLeft,
      skipped,
    }
  },
})

export function shouldMarkReadyShardGuildAbsent(
  guild: ReadyShardGuild,
  leftAt: number
): boolean {
  if (guild.botLeftAt !== undefined) {
    return false
  }

  const latestPresenceAt = Math.max(
    guild.botJoinedAt ?? 0,
    guild.botInstallationVerifiedAt ?? 0,
    guild.lastSyncedAt ?? 0
  )

  return leftAt > latestPresenceAt
}

export function getGuildShardId(
  discordGuildId: string,
  shardCount: number
): number | null {
  if (
    !/^\d{17,20}$/.test(discordGuildId) ||
    !Number.isSafeInteger(shardCount) ||
    shardCount <= 0
  ) {
    return null
  }

  return Number((BigInt(discordGuildId) >> 22n) % BigInt(shardCount))
}

function normalizeLeftAt(leftAt: number, now: number): number {
  if (
    !Number.isSafeInteger(leftAt) ||
    leftAt < 0 ||
    leftAt > now + MAX_EVENT_CLOCK_SKEW_MS
  ) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_EVENT_TIMESTAMP",
      message:
        "leftAt must be a valid non-future Discord guild event timestamp.",
    })
  }

  return leftAt
}
