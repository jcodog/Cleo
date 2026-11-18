import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingCatalogueOperations = defineTable({
  userId: v.id("users"),
  accountId: v.string(),
  key: v.string(),
  request: v.string(),
  worker: v.string(),
  leaseUntil: v.number(),
  dispatched: v.optional(v.boolean()),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  result: v.optional(v.string()),
  rejection: v.optional(v.string()),
})
  .index("by_user_key", ["userId", "key"])
  .index("by_user_completed", ["userId", "completedAt"])
  .index("by_created", ["createdAt"])
