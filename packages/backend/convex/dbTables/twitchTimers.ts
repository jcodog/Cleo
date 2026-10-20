import { defineTable } from "convex/server"
import { v } from "convex/values"

export const timerFields = {
  name: v.string(),
  enabled: v.boolean(),
  intervalMinutes: v.number(),
  minimumMessages: v.number(),
  messages: v.array(v.string()),
}
export const timerState = v.union(
  v.literal("ready"),
  v.literal("waitingForStream"),
  v.literal("waitingForActivity"),
  v.literal("intervalPending"),
  v.literal("rateLimited"),
  v.literal("queueBusy"),
  v.literal("queueExpired"),
  v.literal("providerUnavailable"),
  v.literal("authorizationRevoked"),
  v.literal("failed"),
  v.literal("uncertain")
)
export const timerGroupFields = {
  userId: v.id("users"),
  broadcasterId: v.string(),
  ...timerFields,
  order: v.number(),
  revision: v.number(),
  updatedAt: v.number(),
  deleted: v.boolean(),
  cursor: v.number(),
  executionSequence: v.optional(v.number()),
  streamId: v.optional(v.string()),
  sessionStartedAt: v.optional(v.number()),
  sessionLive: v.optional(v.boolean()),
  lastSentAt: v.optional(v.number()),
  lastAttemptAt: v.optional(v.number()),
  execution: v.optional(
    v.object({
      id: v.string(),
      revision: v.number(),
      cursor: v.number(),
      expiresAt: v.number(),
      streamId: v.optional(v.string()),
      phase: v.optional(
        v.union(
          v.literal("prepared"),
          v.literal("sending"),
          v.literal("uncertain")
        )
      ),
      rotation: v.optional(v.string()),
      priorAttemptAt: v.optional(v.number()),
    })
  ),
  diagnostic: v.optional(timerState),
  diagnosticAt: v.optional(v.number()),
}
export const timerGroupDoc = v.object({
  ...timerGroupFields,
  _id: v.id("twitchTimerGroups"),
  _creationTime: v.number(),
})
export const timerProjection = v.object({
  id: v.id("twitchTimerGroups"),
  ...timerFields,
  revision: v.number(),
  cursor: v.number(),
  sessionLive: v.optional(v.boolean()),
  lastSentAt: v.optional(v.number()),
  lastAttemptAt: v.optional(v.number()),
  diagnostic: v.optional(timerState),
  diagnosticAt: v.optional(v.number()),
  locked: v.boolean(),
  broadcasterChanged: v.boolean(),
})
export const runtimeGroup = v.object({
  id: v.id("twitchTimerGroups"),
  broadcasterId: v.string(),
  ...timerFields,
  revision: v.number(),
  cursor: v.number(),
  streamId: v.optional(v.string()),
  sessionStartedAt: v.optional(v.number()),
  sessionLive: v.optional(v.boolean()),
  lastSentAt: v.optional(v.number()),
  lastAttemptAt: v.optional(v.number()),
})
export const runtimePageResult = v.object({
  groups: v.array(runtimeGroup),
  cursor: v.union(v.string(), v.null()),
  startedAt: v.number(),
})
export const claimResult = v.union(
  v.null(),
  v.object({
    executionId: v.string(),
    message: v.string(),
    expiresAt: v.number(),
  })
)
export const twitchTimerGroups = defineTable(timerGroupFields)
  .index("by_user", ["userId", "deleted", "order"])
  .index("by_enabled", ["enabled", "deleted"])
  .index("by_updated", ["updatedAt"])
  .index("by_broadcaster", ["broadcasterId", "deleted"])

export const timerSessionFields = {
  broadcasterId: v.string(),
  streamId: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  live: v.boolean(),
  observedAt: v.number(),
  lastCompleted: v.optional(
    v.object({
      streamId: v.string(),
      startedAt: v.number(),
      observedAt: v.number(),
    })
  ),
}
export const twitchTimerSessions = defineTable(timerSessionFields).index(
  "by_broadcaster",
  ["broadcasterId"]
)

export const twitchTimerGrants = defineTable({
  userId: v.id("users"),
  broadcasterId: v.string(),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  reason: v.string(),
}).index("by_user", ["userId"])
