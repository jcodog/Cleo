import { v } from "convex/values"
import type { Id } from "../../../../_generated/dataModel"
import { internalMutation } from "../../../../_generated/server"
import { applyGuildMetricsTransition } from "../../../../lib/staffDiscordMetrics"

export const upsert = internalMutation({
  args: {
    discordGuildId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    iconHash: v.optional(v.string()),
    ownerDiscordId: v.optional(v.string()),
    memberCount: v.optional(v.number()),
    presenceCount: v.optional(v.number()),
    botJoinedAt: v.optional(v.number()),
    lastSyncedAt: v.number(),
  },
  returns: v.id("guilds"),
  handler: async (ctx, args): Promise<Id<"guilds">> => {
    const now = Date.now()
    const incomingSyncedAt = args.lastSyncedAt

    const existing = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (existing) {
      const latestSyncedAt = Math.max(
        existing.lastSyncedAt ?? 0,
        existing.botLeftAt ?? 0
      )

      if (incomingSyncedAt <= latestSyncedAt) {
        return existing._id
      }

      const nextMemberCount = args.memberCount ?? existing.memberCount
      const nextState = {
        botLeftAt: undefined,
        memberCount: nextMemberCount,
      }

      await applyGuildMetricsTransition(ctx, existing, nextState, now)

      await ctx.db.patch(existing._id, {
        name: args.name,
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        ...(args.iconUrl !== undefined ? { iconUrl: args.iconUrl } : {}),
        ...(args.iconHash !== undefined ? { iconHash: args.iconHash } : {}),
        ...(args.ownerDiscordId !== undefined
          ? { ownerDiscordId: args.ownerDiscordId }
          : {}),
        ...(args.memberCount !== undefined
          ? { memberCount: args.memberCount }
          : {}),
        ...(args.presenceCount !== undefined
          ? { presenceCount: args.presenceCount }
          : {}),
        ...(args.botJoinedAt !== undefined
          ? { botJoinedAt: args.botJoinedAt }
          : {}),
        botLeftAt: undefined,
        staffMetricsTracked: true,
        lastSyncedAt: incomingSyncedAt,
        updatedAt: now,
      })

      return existing._id
    }

    const insertedGuild = {
      discordGuildId: args.discordGuildId,
      name: args.name,
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.iconUrl !== undefined ? { iconUrl: args.iconUrl } : {}),
      ...(args.iconHash !== undefined ? { iconHash: args.iconHash } : {}),
      ...(args.ownerDiscordId !== undefined
        ? { ownerDiscordId: args.ownerDiscordId }
        : {}),
      ...(args.memberCount !== undefined
        ? { memberCount: args.memberCount }
        : {}),
      ...(args.presenceCount !== undefined
        ? { presenceCount: args.presenceCount }
        : {}),
      ...(args.botJoinedAt !== undefined
        ? { botJoinedAt: args.botJoinedAt }
        : {}),
      staffMetricsTracked: true,
      lastSyncedAt: incomingSyncedAt,
      createdAt: now,
      updatedAt: now,
    }

    const guildId = await ctx.db.insert("guilds", insertedGuild)

    await applyGuildMetricsTransition(
      ctx,
      null,
      {
        botLeftAt: undefined,
        memberCount: args.memberCount,
      },
      now
    )

    return guildId
  },
})
