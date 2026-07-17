import { defineTable } from "convex/server"
import { v } from "convex/values"
import { userRole, userStatus } from "./shared"

export const users = defineTable({
  clerkUserId: v.string(),
  email: v.string(),
  displayName: v.optional(v.union(v.string(), v.null())),
  imageUrl: v.optional(v.union(v.string(), v.null())),
  role: userRole,
  status: v.optional(userStatus),
  onboardingCompletedAt: v.optional(v.number()),
  onboardingVersion: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_clerk_user_id", ["clerkUserId"])
  .index("by_email", ["email"])
  .index("by_role", ["role"])
