import { v } from "convex/values"

import { internalMutation } from "../../_generated/server"
import { appSource, logLevel } from "../../dbTables/shared"

export const create = internalMutation({
  args: {
    source: appSource,
    level: logLevel,
    message: v.string(),
    stack: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("errorLogs", {
      ...args,
      createdAt: Date.now(),
    })
  },
})
