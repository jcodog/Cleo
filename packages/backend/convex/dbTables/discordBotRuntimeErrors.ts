import { defineTable } from "convex/server"
import { v } from "convex/values"
import { jsonValue } from "../lib/validators"

export const discordBotRuntimeErrorSeverity = v.union(
  v.literal("info"),
  v.literal("warn"),
  v.literal("error"),
  v.literal("critical")
)

export const discordBotRuntimeErrorServiceArea = v.union(
  v.literal("startup"),
  v.literal("gateway"),
  v.literal("command"),
  v.literal("configuration"),
  v.literal("permission"),
  v.literal("backend"),
  v.literal("transport"),
  v.literal("welcome"),
  v.literal("moderation"),
  v.literal("logging"),
  v.literal("unknown")
)

export const discordBotRuntimeErrors = defineTable({
  severity: discordBotRuntimeErrorSeverity,
  serviceArea: discordBotRuntimeErrorServiceArea,

  message: v.string(),
  stack: v.optional(v.string()),

  guildId: v.optional(v.id("guilds")),
  discordGuildId: v.optional(v.string()),

  commandName: v.optional(v.string()),
  eventName: v.optional(v.string()),
  operation: v.optional(v.string()),

  fingerprint: v.string(),
  metadata: v.optional(jsonValue),

  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  occurrenceCount: v.number(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_fingerprint", ["fingerprint"])
  .index("by_service_area_and_last_seen_at", ["serviceArea", "lastSeenAt"])
  .index("by_severity_and_last_seen_at", ["severity", "lastSeenAt"])
  .index("by_guild_id_and_last_seen_at", ["guildId", "lastSeenAt"])
  .index("by_discord_guild_id_and_last_seen_at", [
    "discordGuildId",
    "lastSeenAt",
  ])
  .index("by_last_seen_at", ["lastSeenAt"])