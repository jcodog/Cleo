import { redactLogMetadata, redactLogText } from "@workspace/logger"
import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"
import { ConvexError, v, type Infer } from "convex/values"

import type { Id } from "../../../../_generated/dataModel"
import { internalMutation } from "../../../../_generated/server"
import {
  discordModerationActionRecordInput,
  type DiscordModerationActionRecordInput,
} from "../../../../lib/discordModerationActions"
import {
  isConvexJsonValue,
  jsonValue,
  type ConvexJsonValue,
} from "../../../../lib/validators"

const MAX_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000
const MAX_REASON_LENGTH = 512
const MAX_FAILURE_CODE_LENGTH = 80
const MAX_OPERATION_ID_LENGTH = 300
const MAX_METADATA_JSON_LENGTH = 5_000

type ModerationActionInsert = {
  discordGuildId: string
  actionType: DiscordModerationActionRecordInput["actionType"]
  actorDiscordUserId: string
  targetDiscordUserId: string
  reason?: string
  result: DiscordModerationActionRecordInput["result"]
  failureCode?: string
  operationId: string
  metadata?: ConvexJsonValue
  occurredAt: number
}

export const record = internalMutation({
  args: {
    action: discordModerationActionRecordInput,
  },
  returns: v.object({
    id: v.id("discordModerationActions"),
    deduplicated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const action = normaliseModerationActionForStorage(args.action, now)

    const existing = await ctx.db
      .query("discordModerationActions")
      .withIndex("by_operation_id", (q) =>
        q.eq("operationId", action.operationId)
      )
      .unique()

    if (existing) {
      return {
        id: existing._id,
        deduplicated: true,
      }
    }

    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", action.discordGuildId)
      )
      .unique()

    const id = await ctx.db.insert("discordModerationActions", {
      ...action,
      ...(guild ? { guildId: guild._id as Id<"guilds"> } : {}),
      createdAt: now,
    })

    return {
      id,
      deduplicated: false,
    }
  },
})

export function normaliseModerationActionForStorage(
  input: DiscordModerationActionRecordInput,
  now: number
): ModerationActionInsert {
  assertDiscordSnowflake("discordGuildId", input.discordGuildId)
  assertDiscordSnowflake("actorDiscordUserId", input.actorDiscordUserId)
  assertDiscordSnowflake("targetDiscordUserId", input.targetDiscordUserId)
  assertModerationTimestamp("occurredAt", input.occurredAt, now)

  const reason = normaliseOptionalText("reason", input.reason, MAX_REASON_LENGTH)
  const failureCode = normaliseFailureCode(input)
  const operationId = normaliseRequiredText(
    "operationId",
    input.operationId,
    MAX_OPERATION_ID_LENGTH
  )
  const metadata = sanitiseModerationActionMetadata(input.metadata)

  return {
    discordGuildId: input.discordGuildId,
    actionType: input.actionType,
    actorDiscordUserId: input.actorDiscordUserId,
    targetDiscordUserId: input.targetDiscordUserId,
    ...(reason !== undefined ? { reason } : {}),
    result: input.result,
    ...(failureCode !== undefined ? { failureCode } : {}),
    operationId,
    ...(metadata !== undefined ? { metadata } : {}),
    occurredAt: input.occurredAt,
  }
}

export function sanitiseModerationActionMetadata(
  metadata: Infer<typeof jsonValue> | undefined
): ConvexJsonValue | undefined {
  if (metadata === undefined) {
    return undefined
  }

  const redacted = redactLogMetadata(metadata)

  if (!isConvexJsonValue(redacted)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_MODERATION_ACTION_METADATA",
      message: "Discord moderation action metadata must be JSON serialisable.",
    })
  }

  const encoded = JSON.stringify(redacted)

  if (encoded.length > MAX_METADATA_JSON_LENGTH) {
    throw new ConvexError({
      code: "DISCORD_MODERATION_ACTION_METADATA_TOO_LARGE",
      message: "Discord moderation action metadata is too large.",
    })
  }

  return redacted
}

function normaliseFailureCode(
  input: DiscordModerationActionRecordInput
): string | undefined {
  const failureCode = normaliseOptionalText(
    "failureCode",
    input.failureCode,
    MAX_FAILURE_CODE_LENGTH
  )

  if (input.result === "success" && failureCode !== undefined) {
    throw new ConvexError({
      code: "INVALID_DISCORD_MODERATION_ACTION_FAILURE_CODE",
      message: "Successful moderation actions must not store a failure code.",
    })
  }

  if (input.result !== "success" && failureCode === undefined) {
    throw new ConvexError({
      code: "INVALID_DISCORD_MODERATION_ACTION_FAILURE_CODE",
      message: "Failed or denied moderation actions require a failure code.",
    })
  }

  return failureCode
}

function assertDiscordSnowflake(field: string, value: string): void {
  if (!isDiscordSnowflake(value)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_SNOWFLAKE",
      message: `${field} must be a valid Discord snowflake.`,
    })
  }
}

function assertModerationTimestamp(
  field: string,
  value: number,
  now: number
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > now + MAX_EVENT_CLOCK_SKEW_MS
  ) {
    throw new ConvexError({
      code: "INVALID_DISCORD_MODERATION_ACTION_TIMESTAMP",
      message: `${field} must be a valid Discord moderation timestamp.`,
    })
  }
}

function normaliseRequiredText(
  field: string,
  value: string,
  maxLength: number
): string {
  const normalised = normaliseOptionalText(field, value, maxLength)

  if (normalised === undefined) {
    throw new ConvexError({
      code: "INVALID_DISCORD_MODERATION_ACTION_TEXT",
      message: `${field} is required.`,
    })
  }

  return normalised
}

function normaliseOptionalText(
  field: string,
  value: string | undefined,
  maxLength: number
): string | undefined {
  const normalised = value?.trim()

  if (!normalised) {
    return undefined
  }

  const redacted = redactLogText(normalised)

  if (redacted.length > maxLength) {
    throw new ConvexError({
      code: "DISCORD_MODERATION_ACTION_TEXT_TOO_LARGE",
      message: `${field} exceeds Discord moderation action text limits.`,
    })
  }

  return redacted
}
