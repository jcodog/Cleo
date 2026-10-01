import { defineTable } from "convex/server"
import { v } from "convex/values"

export const liveMentionMode = v.union(
  v.literal("none"),
  v.literal("everyone"),
  v.literal("role")
)
export const liveConfigFields = {
  liveNotificationsEnabled: v.boolean(),
  liveNotificationChannelId: v.optional(v.string()),
  liveNotificationMentionMode: liveMentionMode,
  liveNotificationRoleId: v.optional(v.string()),
}
export const guildLiveNotificationConfigs = defineTable({
  guildId: v.id("guilds"),
  ...liveConfigFields,
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_guild_id", ["guildId"])

export const twitchLiveEvents = defineTable({
  broadcasterId: v.string(),
  streamId: v.string(),
  messageId: v.string(),
  login: v.string(),
  displayName: v.string(),
  startedAt: v.string(),
  state: v.union(
    v.literal("pending"),
    v.literal("processed"),
    v.literal("failed")
  ),
  attempts: v.number(),
  failure: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_broadcaster_stream", ["broadcasterId", "streamId"])

export const twitchLiveDeliveries = defineTable({
  guildId: v.id("guilds"),
  eventId: v.id("twitchLiveEvents"),
  broadcasterId: v.string(),
  streamId: v.string(),
  login: v.string(),
  displayName: v.string(),
  startedAt: v.string(),
  title: v.optional(v.string()),
  category: v.optional(v.string()),
  state: v.union(
    v.literal("pending"),
    v.literal("claimed"),
    v.literal("sending"),
    v.literal("sent"),
    v.literal("failed"),
    v.literal("uncertain"),
    v.literal("cancelled")
  ),
  claim: v.optional(v.string()),
  claimExpiresAt: v.optional(v.number()),
  attempts: v.number(),
  messageId: v.optional(v.string()),
  failure: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_guild_stream", ["guildId", "broadcasterId", "streamId"])
  .index("by_guild_state", ["guildId", "state"])

export const twitchLiveSubscriptions = defineTable({
  broadcasterId: v.string(),
  status: v.union(
    v.literal("ready"),
    v.literal("pending"),
    v.literal("unavailable")
  ),
  checkedAt: v.number(),
}).index("by_broadcaster", ["broadcasterId"])
