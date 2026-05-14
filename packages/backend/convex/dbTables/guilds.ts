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
  botLeftAt: v.optional(v.number()),

  lastOpenedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_discord_guild_id", ["discordGuildId"])
