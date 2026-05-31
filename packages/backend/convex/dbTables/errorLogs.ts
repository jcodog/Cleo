import { defineTable } from "convex/server"
import { v } from "convex/values"
import { appSource, logLevel } from "./shared"

export const errorLogs = defineTable({
  source: appSource,
  level: logLevel,
  message: v.string(),
  stack: v.optional(v.string()),
  guildId: v.optional(v.string()),
  discordGuildId: v.optional(v.string()),
  metadata: v.optional(v.any()),

  createdAt: v.number(),
})
  .index("by_source_and_created_at", ["source", "createdAt"])
  .index("by_source_and_guild_id_and_created_at", [
    "source",
    "guildId",
    "createdAt",
  ])
  .index("by_source_and_discord_guild_id_and_created_at", [
    "source",
    "discordGuildId",
    "createdAt",
  ])
  .index("by_level_and_created_at", ["level", "createdAt"])
