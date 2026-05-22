import { v } from "convex/values"

import { internalMutation } from "../../../../_generated/server"
import { guildAuditLogSyncStateStatus } from "../../../../dbTables/guildAuditLogSyncStates"

export const upsert = internalMutation({
  args: {
    guildId: v.id("guilds"),
    status: guildAuditLogSyncStateStatus,
    newestDiscordAuditLogId: v.optional(v.string()),
    newestOccurredAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guild = await ctx.db.get(args.guildId)

    if (!guild) {
      return null
    }

    const now = Date.now()
    const existing = await ctx.db
      .query("guildAuditLogSyncStates")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()
    const fields = {
      guildId: guild._id,
      discordGuildId: guild.discordGuildId,
      ...(args.newestDiscordAuditLogId !== undefined
        ? { newestDiscordAuditLogId: args.newestDiscordAuditLogId }
        : existing?.newestDiscordAuditLogId !== undefined
          ? { newestDiscordAuditLogId: existing.newestDiscordAuditLogId }
          : {}),
      ...(args.newestOccurredAt !== undefined
        ? { newestOccurredAt: args.newestOccurredAt }
        : existing?.newestOccurredAt !== undefined
          ? { newestOccurredAt: existing.newestOccurredAt }
          : {}),
      lastSyncedAt: now,
      lastSyncStatus: args.status,
      ...(args.lastSyncError !== undefined
        ? { lastSyncError: args.lastSyncError }
        : {}),
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.replace(existing._id, {
        ...fields,
        createdAt: existing.createdAt,
      })
      return null
    }

    await ctx.db.insert("guildAuditLogSyncStates", {
      ...fields,
      createdAt: now,
    })

    return null
  },
})
