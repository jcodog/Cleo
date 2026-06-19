import { redactLogMetadata, redactLogText } from "@workspace/logger"
import { v, type Infer } from "convex/values"

import type { Id } from "../../../_generated/dataModel"
import { internalMutation } from "../../../_generated/server"
import { appSource, logLevel } from "../../../dbTables/shared"
import { jsonValue, type ConvexJsonValue } from "../../../lib/validators"

const createErrorLogArgs = {
  source: appSource,
  level: logLevel,
  message: v.string(),
  stack: v.optional(v.string()),
  metadata: v.optional(jsonValue),
}
type CreateErrorLogArgs = {
  source: Infer<typeof appSource>
  level: Infer<typeof logLevel>
  message: string
  stack?: string
  metadata?: ConvexJsonValue
}

export const create = internalMutation({
  args: createErrorLogArgs,
  returns: v.id("errorLogs"),
  handler: async (ctx, args): Promise<Id<"errorLogs">> => {
    return await ctx.db.insert(
      "errorLogs",
      createErrorLogDocument(args, Date.now())
    )
  },
})

export function createErrorLogDocument(
  args: CreateErrorLogArgs,
  createdAt: number
) {
  const guildScope = getGuildScope(args.metadata)

  return {
    source: args.source,
    level: args.level,
    message: redactLogText(args.message),
    ...(args.stack !== undefined ? { stack: redactLogText(args.stack) } : {}),
    ...guildScope,
    ...(args.metadata !== undefined
      ? { metadata: redactLogMetadata(args.metadata) }
      : {}),
    createdAt,
  }
}

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
