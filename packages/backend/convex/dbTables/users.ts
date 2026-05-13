import { defineTable } from "convex/server"
import { v } from "convex/values"
import { userRole, userStatus } from "./shared"

export const users = defineTable({
  clerkUserId: v.string(),
  email: v.string(),
  displayName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  role: userRole,
  status: v.optional(userStatus),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_clerk_user_id", ["clerkUserId"])
  .index("by_email", ["email"])
  .index("by_role", ["role"])
