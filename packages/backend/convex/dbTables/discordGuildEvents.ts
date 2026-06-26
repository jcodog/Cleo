import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  discordGuildEventTargetType,
  discordGuildEventType,
} from "../lib/discordGuildEvents"
import { jsonValue } from "../lib/validators"

export const discordGuildEvents = defineTable({
  discordGuildId: v.string(),
  guildId: v.optional(v.id("guilds")),
  eventType: discordGuildEventType,
  actorDiscordUserId: v.optional(v.string()),
  targetType: discordGuildEventTargetType,
  targetDiscordId: v.optional(v.string()),
  targetDisplayName: v.optional(v.string()),
  channelId: v.optional(v.string()),
  roleId: v.optional(v.string()),
  reason: v.optional(v.string()),
  metadata: v.optional(jsonValue),
  occurredAt: v.number(),
  createdAt: v.number(),
  dedupeKey: v.string(),
})
  .index("by_discord_guild_id_and_occurred_at", [
    "discordGuildId",
    "occurredAt",
  ])
  .index("by_guild_id_and_occurred_at", ["guildId", "occurredAt"])
  .index("by_event_type_and_occurred_at", ["eventType", "occurredAt"])
  .index("by_occurred_at", ["occurredAt"])
  .index("by_dedupe_key", ["dedupeKey"])
