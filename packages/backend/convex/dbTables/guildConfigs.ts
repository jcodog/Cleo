import { defineTable } from "convex/server"
import { v } from "convex/values"

export const guildConfigs = defineTable({
  guildId: v.id("guilds"),

  aiEnabled: v.boolean(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  commandPrefix: v.optional(v.string()),
  logLevel: v.optional(
    v.union(
      v.literal("none"),
      v.literal("minimal"),
      v.literal("medium"),
      v.literal("maximum")
    )
  ),

  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),
  updateChannelId: v.optional(v.string()),
  announcementsChannelId: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_guild_id", ["guildId"])
