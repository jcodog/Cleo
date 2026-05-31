import { defineTable } from "convex/server"
import { v } from "convex/values"

export const guildAuditLogSyncStateStatus = v.union(
  v.literal("ready"),
  v.literal("pendingBotSync"),
  v.literal("discordBotTokenUnavailable"),
  v.literal("discordApiUnavailable")
)

export const guildAuditLogSyncStates = defineTable({
  guildId: v.id("guilds"),
  discordGuildId: v.string(),
  newestDiscordAuditLogId: v.optional(v.string()),
  newestOccurredAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  lastSyncStatus: guildAuditLogSyncStateStatus,
  lastSyncError: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_guild_id", ["guildId"])
  .index("by_discord_guild_id", ["discordGuildId"])
