import { defineTable } from "convex/server"
import { v } from "convex/values"

export const guildSupportTargetType = v.union(
  v.literal("channel"),
  v.literal("thread"),
  v.literal("forum")
)

export const guildSupportTranscriptPolicy = v.union(
  v.literal("metadata-only"),
  v.literal("explicit-messages")
)

export const guildSupportEscalationPolicy = v.union(
  v.literal("none"),
  v.literal("jcn-product-only")
)

export const guildSupportConfigs = defineTable({
  guildId: v.id("guilds"),
  enabled: v.boolean(),
  staffRoleIds: v.array(v.string()),
  targetId: v.optional(v.string()),
  targetType: guildSupportTargetType,
  transcriptPolicy: guildSupportTranscriptPolicy,
  escalationPolicy: guildSupportEscalationPolicy,
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_guild_id", ["guildId"])
