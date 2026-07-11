import { v, type Infer } from "convex/values"

import { jsonValue } from "./validators"

export const discordModerationActionType = v.union(
  v.literal("ban"),
  v.literal("kick")
)

export const discordModerationActionResult = v.union(
  v.literal("success"),
  v.literal("failed"),
  v.literal("denied")
)

export const discordModerationActionRecordInput = v.object({
  discordGuildId: v.string(),
  actionType: discordModerationActionType,
  actorDiscordUserId: v.string(),
  targetDiscordUserId: v.string(),
  reason: v.optional(v.string()),
  result: discordModerationActionResult,
  failureCode: v.optional(v.string()),
  operationId: v.string(),
  metadata: v.optional(jsonValue),
  occurredAt: v.number(),
})

export type DiscordModerationActionRecordInput = Infer<
  typeof discordModerationActionRecordInput
>
