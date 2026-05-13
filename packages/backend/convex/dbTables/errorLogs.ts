import { defineTable } from "convex/server"
import { v } from "convex/values"
import { appSource, logLevel } from "./shared"

export const errorLogs = defineTable({
  source: appSource,
  level: logLevel,
  message: v.string(),
  stack: v.optional(v.string()),
  metadata: v.optional(v.any()),

  createdAt: v.number(),
})
  .index("by_source_and_created_at", ["source", "createdAt"])
  .index("by_level_and_created_at", ["level", "createdAt"])
