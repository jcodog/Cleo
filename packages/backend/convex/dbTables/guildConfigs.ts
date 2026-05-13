import { defineTable } from "convex/server"
import { v } from "convex/values"

export const guildConfigs = defineTable({
  guildId: v.id("guilds"),

  aiEnabled: v.boolean(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),

  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),

  commandPrefix: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_guild_id", ["guildId"])
