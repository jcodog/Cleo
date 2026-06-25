import { defineTable } from "convex/server"
import { v } from "convex/values"

export const appFeatureKeys = ["discordRuntimeIncidents"] as const

export type AppFeatureKey = (typeof appFeatureKeys)[number]

export const appFeatureKey = v.union(v.literal("discordRuntimeIncidents"))

export const appFeatureGates = defineTable({
  key: appFeatureKey,
  enabled: v.boolean(),
  enabledForClerkUserIds: v.optional(v.array(v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_key", ["key"])
