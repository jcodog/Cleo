import { defineTable } from "convex/server"
import { v } from "convex/values"

export const guilds = defineTable({
  discordGuildId: v.string(),
  name: v.string(),
  iconUrl: v.optional(v.string()),
  ownerDiscordId: v.optional(v.string()),
  botJoinedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_discord_guild_id", ["discordGuildId"])
