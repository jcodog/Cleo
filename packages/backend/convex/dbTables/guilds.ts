import { defineTable } from "convex/server"
import { v } from "convex/values"

export const guilds = defineTable({
  discordGuildId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
  iconHash: v.optional(v.string()),
  ownerDiscordId: v.optional(v.string()),

  memberCount: v.optional(v.number()),
  presenceCount: v.optional(v.number()),

  botJoinedAt: v.optional(v.number()),
  botInstallationVerifiedAt: v.optional(v.number()),
  botLeftAt: v.optional(v.number()),
  staffMetricsTracked: v.optional(v.boolean()),

  lastOpenedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  readyShardId: v.optional(v.number()),
  readyShardCount: v.optional(v.number()),
  readyShardKey: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_discord_guild_id", ["discordGuildId"])
  .index("by_ready_shard_key", ["readyShardKey"])
  .index("by_bot_left_at_and_member_count", ["botLeftAt", "memberCount"])
  .index("by_bot_joined_at", ["botJoinedAt"])
  .index("by_bot_installation_verified_at", ["botInstallationVerifiedAt"])
  .index("by_bot_left_at", ["botLeftAt"])
