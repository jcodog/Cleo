import { redactLogMetadata, redactLogText } from "@workspace/logger"
import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"
import { ConvexError, v, type Infer } from "convex/values"

import type { Doc, Id } from "../../../../_generated/dataModel"
import {
  internalMutation,
  type MutationCtx,
} from "../../../../_generated/server"
import {
  discordGuildEventRecordInput,
  type DiscordGuildEventRecordInput,
} from "../../../../lib/discordGuildEvents"
import {
  isConvexJsonValue,
  jsonValue,
  type ConvexJsonValue,
} from "../../../../lib/validators"
import { insertGuildAuditEvent } from "../../../../lib/guildAudit"

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

type GuildAuditProjection = {
  summary: string
  metadata: ConvexJsonValue
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
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", event.discordGuildId)
      )
      .unique()

    const existing = await ctx.db
      .query("discordGuildEvents")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", event.dedupeKey))
      .unique()

    if (existing) {
      if (guild) {
        await ensureGuildAuditProjection(ctx, guild, existing)
      }

      return {
        id: existing._id,
        deduplicated: true,
      }
    }

    const id = await ctx.db.insert("discordGuildEvents", {
      ...event,
      ...(guild ? { guildId: guild._id as Id<"guilds"> } : {}),
      createdAt: now,
    })

    if (guild) {
      await ensureGuildAuditProjection(ctx, guild, event)
    }

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
  const reason = normaliseOptionalText(
    "reason",
    input.reason,
    MAX_REASON_LENGTH
  )
  const metadata = sanitiseDiscordGuildEventMetadata(input.metadata)
  const dedupeKey = normaliseDedupeKey(input)

  assertEventShape(input.eventType, input.targetType, {
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

async function ensureGuildAuditProjection(
  ctx: MutationCtx,
  guild: Doc<"guilds">,
  event: DiscordGuildEventInsert
): Promise<void> {
  const externalId = `gateway:${event.dedupeKey}`
  const existingProjection = await ctx.db
    .query("guildAuditEvents")
    .withIndex("by_guild_id_and_external_id", (q) =>
      q.eq("guildId", guild._id).eq("externalId", externalId)
    )
    .unique()

  if (existingProjection) {
    return
  }

  const projection = projectDiscordGuildEventToAudit(event)

  await insertGuildAuditEvent(ctx, {
    guild,
    source: "bot-action",
    eventType: event.eventType,
    summary: projection.summary,
    ...(event.actorDiscordUserId !== undefined
      ? { actorDiscordUserId: event.actorDiscordUserId }
      : {}),
    ...(event.targetDiscordId !== undefined
      ? { targetDiscordId: event.targetDiscordId }
      : {}),
    targetType: event.targetType,
    externalId,
    metadata: projection.metadata,
    occurredAt: event.occurredAt,
  })
}

export function projectDiscordGuildEventToAudit(
  event: DiscordGuildEventInsert
): GuildAuditProjection {
  const target =
    event.targetDisplayName ??
    event.targetDiscordId ??
    event.channelId ??
    event.roleId
  const summary = target
    ? `${getDiscordGuildEventLabel(event.eventType)}: ${target}`
    : getDiscordGuildEventLabel(event.eventType)
  const metadata: Record<string, string> = {}

  if (event.reason !== undefined) {
    metadata.reason = event.reason
  }

  if (event.channelId !== undefined) {
    metadata.channelId = event.channelId
  }

  if (event.roleId !== undefined) {
    metadata.roleId = event.roleId
  }

  if (event.targetDisplayName !== undefined) {
    metadata.targetDisplayName = event.targetDisplayName
  }

  return {
    summary,
    metadata,
  }
}

function getDiscordGuildEventLabel(
  eventType: DiscordGuildEventInputEventType
): string {
  switch (eventType) {
    case "guildMemberAdd":
      return "Member joined"
    case "guildMemberRemove":
      return "Member left"
    case "guildBanAdd":
      return "User banned"
    case "guildBanRemove":
      return "User unbanned"
    case "channelCreate":
      return "Channel created"
    case "channelDelete":
      return "Channel deleted"
    case "roleCreate":
      return "Role created"
    case "roleDelete":
      return "Role deleted"
    case "messageDelete":
      return "Message deleted"
  }
}

type DiscordGuildEventInputEventType = DiscordGuildEventRecordInput["eventType"]

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

function assertEventShape(
  eventType: DiscordGuildEventRecordInput["eventType"],
  targetType: DiscordGuildEventRecordInput["targetType"],
  fields: {
    targetDiscordId?: string
    channelId?: string
    roleId?: string
  }
): void {
  const expectedTargetType = getExpectedTargetType(eventType)

  if (targetType !== expectedTargetType) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_EVENT",
      message: `targetType must be ${expectedTargetType} for ${eventType}.`,
    })
  }

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

function getExpectedTargetType(
  eventType: DiscordGuildEventRecordInput["eventType"]
): DiscordGuildEventRecordInput["targetType"] {
  switch (eventType) {
    case "guildMemberAdd":
    case "guildMemberRemove":
      return "member"
    case "guildBanAdd":
    case "guildBanRemove":
      return "user"
    case "channelCreate":
    case "channelDelete":
      return "channel"
    case "roleCreate":
    case "roleDelete":
      return "role"
    case "messageDelete":
      return "message"
  }
}

function throwMissingField(field: string, eventType: string): never {
  throw new ConvexError({
    code: "INVALID_DISCORD_GUILD_EVENT",
    message: `${field} is required for ${eventType}.`,
  })
}
