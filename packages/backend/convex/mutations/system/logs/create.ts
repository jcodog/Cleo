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
    const guildScope = getGuildScope(args.metadata)

    return await ctx.db.insert("errorLogs", {
      source: args.source,
      level: args.level,
      message: args.message,
      ...(args.stack !== undefined ? { stack: args.stack } : {}),
      ...guildScope,
      ...(args.metadata !== undefined
        ? { metadata: redactLogMetadata(args.metadata) }
        : {}),
      createdAt: Date.now(),
    })
  },
})

function getGuildScope(metadata: unknown): {
  guildId?: string
  discordGuildId?: string
} {
  if (!isObjectRecord(metadata)) {
    return {}
  }

  const guildMetadata = metadata.guild

  return {
    ...(typeof metadata.guildId === "string"
      ? { guildId: metadata.guildId }
      : isObjectRecord(guildMetadata) &&
          typeof guildMetadata.guildId === "string"
        ? { guildId: guildMetadata.guildId }
        : {}),
    ...(typeof metadata.discordGuildId === "string"
      ? { discordGuildId: metadata.discordGuildId }
      : isObjectRecord(guildMetadata) &&
          typeof guildMetadata.discordGuildId === "string"
        ? { discordGuildId: guildMetadata.discordGuildId }
        : {}),
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
