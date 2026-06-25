import { ConvexError, v, type Infer } from "convex/values"

import { internalMutation } from "../../../../_generated/server"
import {
  discordBotRuntimeErrorServiceArea,
  discordBotRuntimeErrorSeverity,
} from "../../../../dbTables/discordBotRuntimeErrors"
import { jsonValue } from "../../../../lib/validators"
import { redactLogMetadata, redactLogText } from "@workspace/logger"

const MAX_MESSAGE_LENGTH = 2_000
const MAX_STACK_LENGTH = 8_000
const MAX_METADATA_JSON_LENGTH = 10_000
const MAX_FINGERPRINT_LENGTH = 512

const DISCORD_SNOWFLAKE_REGEX = /^\d{17,20}$/

type RuntimeErrorMetadata = Infer<typeof jsonValue>

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

export const normaliseOptionalString = (
  value: string | undefined,
  maxLength: number
) => {
  const normalised = value?.trim()

  if (!normalised) {
    return undefined
  }

  return truncate(redactLogText(normalised), maxLength)
}

export const assertValidDiscordGuildId = (discordGuildId: string | undefined) => {
  if (!discordGuildId) {
    return
  }

  if (!DISCORD_SNOWFLAKE_REGEX.test(discordGuildId)) {
    throw new ConvexError("Invalid Discord guild ID.")
  }
}

export const sanitiseMetadata = (
  metadata: RuntimeErrorMetadata | undefined
): RuntimeErrorMetadata | undefined => {
  if (metadata === undefined) {
    return undefined
  }

  const redacted = redactLogMetadata(metadata) as RuntimeErrorMetadata
  const encoded = JSON.stringify(redacted)

  if (encoded.length > MAX_METADATA_JSON_LENGTH) {
    throw new ConvexError("Runtime error metadata is too large.")
  }

  return redacted
}

export const buildFingerprint = (args: {
  fingerprint: string | undefined
  serviceArea: string
  severity: string
  discordGuildId: string | undefined
  commandName: string | undefined
  eventName: string | undefined
  operation: string | undefined
  message: string
}) => {
  const explicitFingerprint = args.fingerprint?.trim()

  if (explicitFingerprint) {
    return truncate(redactLogText(explicitFingerprint), MAX_FINGERPRINT_LENGTH)
  }

  return truncate(
    [
      args.serviceArea,
      args.severity,
      args.discordGuildId ?? "global",
      args.commandName ?? "",
      args.eventName ?? "",
      args.operation ?? "",
      args.message,
    ].join(":"),
    MAX_FINGERPRINT_LENGTH
  )
}

export const record = internalMutation({
  args: {
    severity: discordBotRuntimeErrorSeverity,
    serviceArea: discordBotRuntimeErrorServiceArea,

    message: v.string(),
    stack: v.optional(v.string()),

    guildId: v.optional(v.id("guilds")),
    discordGuildId: v.optional(v.string()),

    commandName: v.optional(v.string()),
    eventName: v.optional(v.string()),
    operation: v.optional(v.string()),

    fingerprint: v.optional(v.string()),
    metadata: v.optional(jsonValue),

    occurredAt: v.optional(v.number()),
  },
  returns: v.object({
    id: v.id("discordBotRuntimeErrors"),
    deduplicated: v.boolean(),
    occurrenceCount: v.number(),
  }),
  handler: async (ctx, args) => {
    assertValidDiscordGuildId(args.discordGuildId)

    const now = Date.now()
    const occurredAt = args.occurredAt ?? now

    const message = normaliseOptionalString(args.message, MAX_MESSAGE_LENGTH)

    if (!message) {
      throw new ConvexError("Runtime error message is required.")
    }

    const stack = normaliseOptionalString(args.stack, MAX_STACK_LENGTH)
    const commandName = normaliseOptionalString(args.commandName, 100)
    const eventName = normaliseOptionalString(args.eventName, 100)
    const operation = normaliseOptionalString(args.operation, 150)
    const metadata = sanitiseMetadata(args.metadata)

    const fingerprint = buildFingerprint({
      fingerprint: args.fingerprint,
      serviceArea: args.serviceArea,
      severity: args.severity,
      discordGuildId: args.discordGuildId,
      commandName,
      eventName,
      operation,
      message,
    })

    const existing = await ctx.db
      .query("discordBotRuntimeErrors")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .unique()

    if (existing) {
      const occurrenceCount = existing.occurrenceCount + 1

      await ctx.db.patch(existing._id, {
        severity: args.severity,
        serviceArea: args.serviceArea,
        message,
        stack,
        guildId: args.guildId,
        discordGuildId: args.discordGuildId,
        commandName,
        eventName,
        operation,
        metadata,
        lastSeenAt: occurredAt,
        occurrenceCount,
        updatedAt: now,
      })

      return {
        id: existing._id,
        deduplicated: true,
        occurrenceCount,
      }
    }

    const id = await ctx.db.insert("discordBotRuntimeErrors", {
      severity: args.severity,
      serviceArea: args.serviceArea,
      message,
      stack,
      guildId: args.guildId,
      discordGuildId: args.discordGuildId,
      commandName,
      eventName,
      operation,
      fingerprint,
      metadata,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
      occurrenceCount: 1,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      deduplicated: false,
      occurrenceCount: 1,
    }
  },
})