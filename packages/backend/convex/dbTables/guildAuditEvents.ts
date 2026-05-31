import { defineTable } from "convex/server"
import { v } from "convex/values"

export const guildAuditEventSource = v.union(
  v.literal("dashboard"),
  v.literal("discord-audit-log"),
  v.literal("bot-action")
)

export const guildAuditEvents = defineTable({
  guildId: v.id("guilds"),
  discordGuildId: v.string(),
  source: guildAuditEventSource,
  eventType: v.string(),
  summary: v.string(),
  actorUserId: v.optional(v.id("users")),
  actorDiscordUserId: v.optional(v.string()),
  actorDisplayName: v.optional(v.string()),
  targetDiscordId: v.optional(v.string()),
  targetType: v.optional(v.string()),
  externalId: v.optional(v.string()),
  metadata: v.optional(v.any()),
  occurredAt: v.number(),
  createdAt: v.number(),
})
  .index("by_guild_id_and_occurred_at", ["guildId", "occurredAt"])
  .index("by_guild_id_and_source_and_occurred_at", [
    "guildId",
    "source",
    "occurredAt",
  ])
  .index("by_guild_id_and_external_id", ["guildId", "externalId"])
