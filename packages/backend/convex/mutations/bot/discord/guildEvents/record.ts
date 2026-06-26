import { redactLogMetadata, redactLogText } from "@workspace/logger"
import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"
import { ConvexError, v, type Infer } from "convex/values"

import type { Id } from "../../../../_generated/dataModel"
import { internalMutation } from "../../../../_generated/server"
import {
  discordGuildEventRecordInput,
  type DiscordGuildEventRecordInput,
} from "../../../../lib/discordGuildEvents"
import {
  isConvexJsonValue,
  jsonValue,
  type ConvexJsonValue,
} from "../../../../lib/validators"

const MAX_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000
const MAX_DEDUPE_KEY_LENGTH = 300
const MAX_REASON_LENGTH = 512
const MAX_TARGET_DISPLAY_NAME_LENGTH = 120
const MAX_METADATA_JSON_LENGTH = 5_000

const rawMessageContentKeys = new Set([
  "cleanContent",
  "content",
  "messageContent",
  "rawContent",
])

type DiscordGuildEventInsert = {
  discordGuildId: string
  eventType: DiscordGuildEventRecordInput["eventType"]
  actorDiscordUserId?: string
  targetType: DiscordGuildEventRecordInput["targetType"]
  targetDiscordId?: string
  targetDisplayName?: string
  channelId?: string
  roleId?: string
  reason?: string
  metadata?: ConvexJsonValue
  occurredAt: number
  dedupeKey: string
}

export const record = internalMutation({
  args: {
    event: discordGuildEventRecordInput,
  },
  returns: v.object({
    id: v.id("discordGuildEvents"),
    deduplicated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const event = normaliseDiscordGuildEventForStorage(args.event, now)

    const existing = await ctx.db
      .query("discordGuildEvents")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", event.dedupeKey))
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
        q.eq("discordGuildId", event.discordGuildId)
      )
      .unique()

    const id = await ctx.db.insert("discordGuildEvents", {
      ...event,
      ...(guild ? { guildId: guild._id as Id<"guilds"> } : {}),
      createdAt: now,
    })

    return {
      id,
      deduplicated: false,
    }
  },
})

export function normaliseDiscordGuildEventForStorage(
  input: DiscordGuildEventRecordInput,
  now: number
): DiscordGuildEventInsert {
  assertDiscordSnowflake("discordGuildId", input.discordGuildId)
  assertDiscordEventTimestamp("occurredAt", input.occurredAt, now)

  const actorDiscordUserId = normaliseOptionalDiscordSnowflake(
    "actorDiscordUserId",
    input.actorDiscordUserId
  )
  const targetDiscordId = normaliseOptionalDiscordSnowflake(
    "targetDiscordId",
    input.targetDiscordId
  )
  const channelId = normaliseOptionalDiscordSnowflake(
    "channelId",
    input.channelId
  )
  const roleId = normaliseOptionalDiscordSnowflake("roleId", input.roleId)
  const targetDisplayName = normaliseOptionalText(
    "targetDisplayName",
    input.targetDisplayName,
    MAX_TARGET_DISPLAY_NAME_LENGTH
  )
  const reason = normaliseOptionalText("reason", input.reason, MAX_REASON_LENGTH)
  const metadata = sanitiseDiscordGuildEventMetadata(input.metadata)
  const dedupeKey = normaliseDedupeKey(input)

  assertRequiredEventFields(input.eventType, {
    targetDiscordId,
    channelId,
    roleId,
  })

  return {
    discordGuildId: input.discordGuildId,
    eventType: input.eventType,
    ...(actorDiscordUserId !== undefined ? { actorDiscordUserId } : {}),
    targetType: input.targetType,
    ...(targetDiscordId !== undefined ? { targetDiscordId } : {}),
    ...(targetDisplayName !== undefined ? { targetDisplayName } : {}),
    ...(channelId !== undefined ? { channelId } : {}),
    ...(roleId !== undefined ? { roleId } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    occurredAt: input.occurredAt,
    dedupeKey,
  }
}

export function sanitiseDiscordGuildEventMetadata(
  metadata: Infer<typeof jsonValue> | undefined
): ConvexJsonValue | undefined {
  if (metadata === undefined) {
    return undefined
  }

  const redacted = redactLogMetadata(metadata)
  const stripped = stripRawMessageContent(redacted)

  if (stripped === undefined) {
    return undefined
  }

  if (!isConvexJsonValue(stripped)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_EVENT_METADATA",
      message: "Discord guild event metadata must be JSON serialisable.",
    })
  }

  const encoded = JSON.stringify(stripped)

  if (encoded.length > MAX_METADATA_JSON_LENGTH) {
    throw new ConvexError({
      code: "DISCORD_GUILD_EVENT_METADATA_TOO_LARGE",
      message: "Discord guild event metadata is too large.",
    })
  }

  return stripped
}

function stripRawMessageContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripRawMessageContent(item))
      .filter((item) => item !== undefined)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const entries = Object.entries(value)
    .filter(([key]) => !rawMessageContentKeys.has(key))
    .map(([key, nested]) => [key, stripRawMessageContent(nested)] as const)
    .filter(([, nested]) => nested !== undefined)

  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries)
}

function normaliseOptionalDiscordSnowflake(
  field: string,
  value: string | undefined
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  assertDiscordSnowflake(field, value)
  return value
}

function assertDiscordSnowflake(field: string, value: string): void {
  if (!isDiscordSnowflake(value)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_SNOWFLAKE",
      message: `${field} must be a valid Discord snowflake.`,
    })
  }
}

function assertDiscordEventTimestamp(
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
      code: "INVALID_DISCORD_GUILD_EVENT_TIMESTAMP",
      message: `${field} must be a valid Discord guild event timestamp.`,
    })
  }
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
      code: "DISCORD_GUILD_EVENT_TEXT_TOO_LARGE",
      message: `${field} exceeds Discord guild event text limits.`,
    })
  }

  return redacted
}

function normaliseDedupeKey(input: DiscordGuildEventRecordInput): string {
  const explicitDedupeKey = input.dedupeKey?.trim()
  const dedupeKey = explicitDedupeKey
    ? redactLogText(explicitDedupeKey)
    : [
        input.eventType,
        input.discordGuildId,
        input.targetType,
        input.targetDiscordId ?? input.channelId ?? input.roleId ?? "unknown",
        input.occurredAt,
      ].join(":")

  if (dedupeKey.length === 0 || dedupeKey.length > MAX_DEDUPE_KEY_LENGTH) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_EVENT_DEDUPE_KEY",
      message: "Discord guild event dedupe key is invalid.",
    })
  }

  return dedupeKey
}

function assertRequiredEventFields(
  eventType: DiscordGuildEventRecordInput["eventType"],
  fields: {
    targetDiscordId?: string
    channelId?: string
    roleId?: string
  }
): void {
  if (
    [
      "guildMemberAdd",
      "guildMemberRemove",
      "guildBanAdd",
      "guildBanRemove",
    ].includes(eventType) &&
    fields.targetDiscordId === undefined
  ) {
    throwMissingField("targetDiscordId", eventType)
  }

  if (
    (eventType === "channelCreate" || eventType === "channelDelete") &&
    fields.channelId === undefined
  ) {
    throwMissingField("channelId", eventType)
  }

  if (
    (eventType === "roleCreate" || eventType === "roleDelete") &&
    fields.roleId === undefined
  ) {
    throwMissingField("roleId", eventType)
  }

  if (
    eventType === "messageDelete" &&
    (fields.targetDiscordId === undefined || fields.channelId === undefined)
  ) {
    throwMissingField("targetDiscordId and channelId", eventType)
  }
}

function throwMissingField(field: string, eventType: string): never {
  throw new ConvexError({
    code: "INVALID_DISCORD_GUILD_EVENT",
    message: `${field} is required for ${eventType}.`,
  })
}
