import { v, type Infer } from "convex/values"

import { jsonValue } from "./validators"

export const discordGuildEventType = v.union(
  v.literal("guildMemberAdd"),
  v.literal("guildMemberRemove"),
  v.literal("guildBanAdd"),
  v.literal("guildBanRemove"),
  v.literal("channelCreate"),
  v.literal("channelDelete"),
  v.literal("roleCreate"),
  v.literal("roleDelete"),
  v.literal("messageDelete")
)

export const discordGuildEventTargetType = v.union(
  v.literal("member"),
  v.literal("user"),
  v.literal("channel"),
  v.literal("role"),
  v.literal("message")
)

export const discordGuildEventRecordInput = v.object({
  discordGuildId: v.string(),
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
  dedupeKey: v.optional(v.string()),
})

export type DiscordGuildEventRecordInput = Infer<
  typeof discordGuildEventRecordInput
>
