import { redactLogMetadata } from "@workspace/logger"
import { v } from "convex/values"

import type { Id } from "../../../_generated/dataModel"
import { internalMutation } from "../../../_generated/server"
import { appSource, logLevel } from "../../../dbTables/shared"

export const create = internalMutation({
  args: {
    source: appSource,
    level: logLevel,
    message: v.string(),
    stack: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("errorLogs"),
  handler: async (ctx, args): Promise<Id<"errorLogs">> => {
    return await ctx.db.insert("errorLogs", {
      source: args.source,
      level: args.level,
      message: args.message,
      ...(args.stack !== undefined ? { stack: args.stack } : {}),
      ...(args.metadata !== undefined
        ? { metadata: redactLogMetadata(args.metadata) }
        : {}),
      createdAt: Date.now(),
    })
  },
})
