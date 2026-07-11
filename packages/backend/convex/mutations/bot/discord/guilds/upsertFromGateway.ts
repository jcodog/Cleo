import { v } from "convex/values"
import type { Id } from "../../../../_generated/dataModel"
import { internalMutation } from "../../../../_generated/server"

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
        lastSyncedAt: incomingSyncedAt,
        updatedAt: now,
      })

      return existing._id
    }

    return await ctx.db.insert("guilds", {
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
      lastSyncedAt: incomingSyncedAt,
      createdAt: now,
      updatedAt: now,
    })
  },
})
