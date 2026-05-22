import { v } from "convex/values"

import { internalQuery } from "../../../../_generated/server"

export const getByGuildId = internalQuery({
  args: {
    guildId: v.id("guilds"),
  },
  returns: v.union(
    v.object({
      newestDiscordAuditLogId: v.optional(v.string()),
      newestOccurredAt: v.optional(v.number()),
      lastSyncedAt: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const syncState = await ctx.db
      .query("guildAuditLogSyncStates")
      .withIndex("by_guild_id", (q) => q.eq("guildId", args.guildId))
      .unique()

    if (!syncState) {
      return null
    }

    return {
      ...(syncState.newestDiscordAuditLogId !== undefined
        ? { newestDiscordAuditLogId: syncState.newestDiscordAuditLogId }
        : {}),
      ...(syncState.newestOccurredAt !== undefined
        ? { newestOccurredAt: syncState.newestOccurredAt }
        : {}),
      ...(syncState.lastSyncedAt !== undefined
        ? { lastSyncedAt: syncState.lastSyncedAt }
        : {}),
    }
  },
})
