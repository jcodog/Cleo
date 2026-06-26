import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  discordModerationActionResult,
  discordModerationActionType,
} from "../lib/discordModerationActions"
import { jsonValue } from "../lib/validators"

export const discordModerationActions = defineTable({
  discordGuildId: v.string(),
  guildId: v.optional(v.id("guilds")),
  actionType: discordModerationActionType,
  actorDiscordUserId: v.string(),
  targetDiscordUserId: v.string(),
  reason: v.optional(v.string()),
  result: discordModerationActionResult,
  failureCode: v.optional(v.string()),
  operationId: v.string(),
  metadata: v.optional(jsonValue),
  occurredAt: v.number(),
  createdAt: v.number(),
})
  .index("by_discord_guild_id_and_occurred_at", [
    "discordGuildId",
    "occurredAt",
  ])
  .index("by_guild_id_and_occurred_at", ["guildId", "occurredAt"])
  .index("by_action_type_and_occurred_at", ["actionType", "occurredAt"])
  .index("by_actor_discord_user_id_and_occurred_at", [
    "actorDiscordUserId",
    "occurredAt",
  ])
  .index("by_target_discord_user_id_and_occurred_at", [
    "targetDiscordUserId",
    "occurredAt",
  ])
  .index("by_occurred_at", ["occurredAt"])
  .index("by_operation_id", ["operationId"])
