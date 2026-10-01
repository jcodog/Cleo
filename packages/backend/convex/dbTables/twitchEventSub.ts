import { defineTable } from "convex/server"
import { v } from "convex/values"
export const twitchEventConsumers = defineTable({
  consumer: v.string(),
  subscription: v.id("twitchEventSubscriptions"),
}).index("by_consumer", ["consumer"])

export const subscriptionStatus = v.union(
  v.literal("disabled"),
  v.literal("connecting"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("providerUnavailable"),
  v.literal("revoked")
)
export const twitchEventSubscriptions = defineTable({
  identity: v.string(),
  key: v.string(),
  broadcasterId: v.string(),
  condition: v.record(v.string(), v.string()),
  callback: v.string(),
  consumers: v.array(v.string()),
  revision: v.number(),
  status: subscriptionStatus,
  subscriptionId: v.optional(v.string()),
  lease: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  failure: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index("by_identity", ["identity"])
  .index("by_subscription", ["subscriptionId"])
  .index("by_broadcaster", ["broadcasterId"])
export const twitchAnnouncementConfigs = defineTable({
  userId: v.id("users"),
  broadcasterId: v.string(),
  key: v.string(),
  enabled: v.boolean(),
  template: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index("by_user_key", ["userId", "key"])
  .index("by_broadcaster_key", ["broadcasterId", "key"])
export const twitchWebhookReceipts = defineTable({
  messageId: v.string(),
  createdAt: v.number(),
})
  .index("by_message", ["messageId"])
  .index("by_created", ["createdAt"])
