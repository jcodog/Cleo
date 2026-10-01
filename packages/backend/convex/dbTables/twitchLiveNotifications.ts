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
  // Internal projection only; dashboard actions never accept these fields.
  broadcasterId: v.optional(v.string()),
  ownerUserId: v.optional(v.id("users")),
  ownerDiscordId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_guild_id", ["guildId"])
  .index("by_enabled", ["liveNotificationsEnabled"])
  .index("by_broadcaster", ["broadcasterId", "liveNotificationsEnabled"])

export const twitchLiveOwnerChecks = defineTable({
  userId: v.id("users"),
  evidenceKey: v.string(),
  status: v.union(
    v.literal("ready"),
    v.literal("stale"),
    v.literal("missingPermission")
  ),
  broadcasterId: v.optional(v.string()),
  checkedAt: v.number(),
}).index("by_user", ["userId"])

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
})
  .index("by_broadcaster_stream", ["broadcasterId", "streamId"])
  .index("by_created", ["createdAt"])

export const twitchLiveDeliveries = defineTable({
  guildId: v.id("guilds"),
  discordGuildId: v.optional(v.string()),
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
  .index("by_state", ["state"])
  .index("by_created", ["createdAt"])

export const twitchLiveSubscriptions = defineTable({
  broadcasterId: v.string(),
  status: v.union(
    v.literal("ready"),
    v.literal("pending"),
    v.literal("unavailable")
  ),
  checkedAt: v.number(),
}).index("by_broadcaster", ["broadcasterId"])
