import { defineTable } from "convex/server"
import { v } from "convex/values"

export const discordGuildInstallSessions = defineTable({
  userId: v.id("users"),
  discordUserId: v.string(),
  discordGuildId: v.string(),

  status: v.union(
    v.literal("pending"),
    v.literal("bot_joined"),
    v.literal("configured"),
    v.literal("expired")
  ),

  selectedUpdatesChannelId: v.optional(v.string()),
  oauthState: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_user_id_and_status", ["userId", "status"])
  .index("by_discord_user_id_and_status", ["discordUserId", "status"])
  .index("by_guild_user_discord_user_status_expires_at", [
    "discordGuildId",
    "userId",
    "discordUserId",
    "status",
    "expiresAt",
  ])
  .index("by_discord_guild_id", ["discordGuildId"])
