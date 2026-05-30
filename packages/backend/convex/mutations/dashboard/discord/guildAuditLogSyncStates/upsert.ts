import { v } from "convex/values"

import { internalMutation } from "../../../../_generated/server"
import { guildAuditLogSyncStateStatus } from "../../../../dbTables/guildAuditLogSyncStates"

export const upsert = internalMutation({
  args: {
    guildId: v.id("guilds"),
    status: guildAuditLogSyncStateStatus,
    newestDiscordAuditLogId: v.optional(v.string()),
    newestOccurredAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guild = await ctx.db.get(args.guildId)

    if (!guild) {
      return null
    }

    const now = Date.now()
    const lastSyncedAt = args.lastSyncedAt ?? now
    const existing = await ctx.db
      .query("guildAuditLogSyncStates")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()
    const nextCursor = getNextCursor({
      existingDiscordAuditLogId: existing?.newestDiscordAuditLogId,
      existingOccurredAt: existing?.newestOccurredAt,
      incomingDiscordAuditLogId: args.newestDiscordAuditLogId,
      incomingOccurredAt: args.newestOccurredAt,
    })
    const fields = {
      guildId: guild._id,
      discordGuildId: guild.discordGuildId,
      ...(nextCursor.newestDiscordAuditLogId !== undefined
        ? { newestDiscordAuditLogId: nextCursor.newestDiscordAuditLogId }
        : {}),
      ...(nextCursor.newestOccurredAt !== undefined
        ? { newestOccurredAt: nextCursor.newestOccurredAt }
        : {}),
      lastSyncedAt,
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

function getNextCursor({
  existingDiscordAuditLogId,
  existingOccurredAt,
  incomingDiscordAuditLogId,
  incomingOccurredAt,
}: {
  existingDiscordAuditLogId?: string
  existingOccurredAt?: number
  incomingDiscordAuditLogId?: string
  incomingOccurredAt?: number
}): {
  newestDiscordAuditLogId?: string
  newestOccurredAt?: number
} {
  if (
    incomingOccurredAt !== undefined &&
    (existingOccurredAt === undefined ||
      incomingOccurredAt > existingOccurredAt)
  ) {
    return {
      ...(incomingDiscordAuditLogId !== undefined
        ? { newestDiscordAuditLogId: incomingDiscordAuditLogId }
        : {}),
      newestOccurredAt: incomingOccurredAt,
    }
  }

  if (
    incomingOccurredAt !== undefined &&
    existingOccurredAt !== undefined &&
    incomingOccurredAt === existingOccurredAt &&
    incomingDiscordAuditLogId !== undefined &&
    isSnowflakeGreater(incomingDiscordAuditLogId, existingDiscordAuditLogId)
  ) {
    return {
      newestDiscordAuditLogId: incomingDiscordAuditLogId,
      newestOccurredAt: incomingOccurredAt,
    }
  }

  return {
    ...(existingDiscordAuditLogId !== undefined
      ? { newestDiscordAuditLogId: existingDiscordAuditLogId }
      : incomingDiscordAuditLogId !== undefined &&
          existingOccurredAt === undefined
        ? { newestDiscordAuditLogId: incomingDiscordAuditLogId }
        : {}),
    ...(existingOccurredAt !== undefined
      ? { newestOccurredAt: existingOccurredAt }
      : incomingOccurredAt !== undefined
        ? { newestOccurredAt: incomingOccurredAt }
        : {}),
  }
}

function isSnowflakeGreater(left: string, right: string | undefined): boolean {
  if (right === undefined) {
    return true
  }

  try {
    return BigInt(left) > BigInt(right)
  } catch {
    return left > right
  }
}
