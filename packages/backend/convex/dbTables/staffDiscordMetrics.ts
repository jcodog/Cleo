import { defineTable } from "convex/server"
import { v } from "convex/values"

export const staffDiscordMetrics = defineTable({
  key: v.literal("discord"),
  activeGuildCount: v.number(),
  memberCount: v.number(),
  updatedAt: v.number(),
}).index("by_key", ["key"])
