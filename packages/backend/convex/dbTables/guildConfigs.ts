import { defineTable } from "convex/server"
import { v } from "convex/values"
import { welcomeStyle } from "../lib/welcomeStyle"

const guildConfigLogLevel = v.union(
  v.literal("none"),
  v.literal("minimal"),
  v.literal("medium"),
  v.literal("maximum")
)

export const guildConfigs = defineTable({
  guildId: v.id("guilds"),

  aiEnabled: v.boolean(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  commandPrefix: v.optional(v.string()),
  logLevel: v.optional(guildConfigLogLevel),

  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),
  welcomeSubtext: v.optional(v.string()),
  welcomeStyle: v.optional(welcomeStyle),
  updatesChannelId: v.optional(v.string()),
  announcementChannelId: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_guild_id", ["guildId"])
