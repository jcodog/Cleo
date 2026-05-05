import { defineTable } from "convex/server"
import { v } from "convex/values"
import { userRole } from "./shared"

export const users = defineTable({
  workosUserId: v.string(),
  email: v.string(),
  displayName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  role: userRole,
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_workos_user_id", ["workosUserId"])
  .index("by_email", ["email"])
  .index("by_role", ["role"])
