import {
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildBan,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
  type PartialMessage,
  type PartialGuildMember,
  type PermissionsBitField,
  type Role,
} from "discord.js"

import {
  convexBotClient,
  type DiscordGuildEventRecord,
  type DiscordGuildEventRecordResult,
} from "@/services/convexBotClient"
import {
  fetchDiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"
import {
  reportDiscordRuntimeError,
  type DiscordRuntimeErrorReporter,
} from "@/services/runtimeErrorReporter"
import { botLogError } from "@/utils/botLog"
import type { DiscordGuildRuntimeConfigLogLevel } from "@workspace/shared/discordRuntimeConfig"

type RuntimeConfigFetcher = (
  discordGuildId: string
) => Promise<DiscordGuildRuntimeConfigResult>

type GuildEventPersister = (
  event: DiscordGuildEventRecord
) => Promise<DiscordGuildEventRecordResult | null>

type GuildEventFormatter = (
  event: DiscordGuildEventRecord
) => MessageCreateOptions

export type DiscordGuildEventProcessingResult = {
  persistence: "recorded" | "failed"
  delivery:
    | "sent"
    | "deduplicated"
    | "configUnavailable"
    | "loggingDisabled"
    | "filteredByLogLevel"
    | "missingLogChannel"
    | "guildUnavailable"
    | "channelUnavailable"
    | "channelUnsupported"
    | "botMemberUnavailable"
    | "missingBasePermissions"
    | "formatFailed"
    | "sendFailed"
}

type GuildEventLoggingOptions = {
  fetchConfig?: RuntimeConfigFetcher
  persistEvent?: GuildEventPersister
  formatLogMessage?: GuildEventFormatter
  logError?: typeof botLogError
  reportRuntimeError?: DiscordRuntimeErrorReporter
}

type GuildEventContext = {
  guild?: Guild | null
}

type LogSendableChannel = GuildBasedChannel & {
  send(message: MessageCreateOptions): Promise<unknown>
  permissionsFor(member: GuildMember): Readonly<PermissionsBitField> | null
}

const baseLogPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
] as const

const eventMinimumLogLevel: Record<
  DiscordGuildEventRecord["eventType"],
  Exclude<DiscordGuildRuntimeConfigLogLevel, "none">
> = {
  guildBanAdd: "minimal",
  guildBanRemove: "minimal",
  guildMemberAdd: "medium",
  guildMemberRemove: "medium",
  channelCreate: "medium",
  channelDelete: "medium",
  roleCreate: "medium",
  roleDelete: "medium",
  messageDelete: "maximum",
}

const logLevelRank: Record<DiscordGuildRuntimeConfigLogLevel, number> = {
  none: 0,
  minimal: 1,
  medium: 2,
  maximum: 3,
}

export async function handleDiscordGuildEvent(
  event: DiscordGuildEventRecord,
  context: GuildEventContext,
  options: GuildEventLoggingOptions = {}
): Promise<DiscordGuildEventProcessingResult> {
  const logError = options.logError ?? botLogError
  const reportRuntimeError =
    options.reportRuntimeError ?? reportDiscordRuntimeError
  const persistenceResult = await persistDiscordGuildEvent(event, {
    persistEvent: options.persistEvent ?? convexBotClient.recordGuildEvent,
    logError,
    reportRuntimeError,
  })
  const delivery = persistenceResult.deduplicated
    ? "deduplicated"
    : await deliverDiscordGuildEventLog(event, context, {
        fetchConfig: options.fetchConfig ?? fetchDiscordGuildRuntimeConfig,
        formatLogMessage:
          options.formatLogMessage ?? formatGuildEventLogMessage,
        logError,
        reportRuntimeError,
      })

  return {
    persistence: persistenceResult.status,
    delivery,
  }
}

async function persistDiscordGuildEvent(
  event: DiscordGuildEventRecord,
  options: {
    persistEvent: GuildEventPersister
    logError: typeof botLogError
    reportRuntimeError: DiscordRuntimeErrorReporter
  }
): Promise<{
  status: "recorded" | "failed"
  deduplicated: boolean
}> {
  try {
    const result = await options.persistEvent(event)

    if (result !== null) {
      return {
        status: "recorded",
        deduplicated: result.deduplicated,
      }
    }

    options.logError("Discord guild event persistence failed.", undefined, {
      discordGuildId: event.discordGuildId,
      eventName: event.eventType,
    })

    await reportGuildEventRuntimeError({
      error: new Error("Convex guild event record returned null."),
      event,
      operation: "persistGuildEvent",
      message: "Discord guild event persistence failed.",
      logError: options.logError,
      reportRuntimeError: options.reportRuntimeError,
    })

    return {
      status: "failed",
      deduplicated: false,
    }
  } catch (error) {
    options.logError("Discord guild event persistence failed.", error, {
      discordGuildId: event.discordGuildId,
      eventName: event.eventType,
    })

    await reportGuildEventRuntimeError({
      error,
      event,
      operation: "persistGuildEvent",
      message: "Discord guild event persistence failed.",
      logError: options.logError,
      reportRuntimeError: options.reportRuntimeError,
    })

    return {
      status: "failed",
      deduplicated: false,
    }
  }
}

async function deliverDiscordGuildEventLog(
  event: DiscordGuildEventRecord,
  context: GuildEventContext,
  options: {
    fetchConfig: RuntimeConfigFetcher
    formatLogMessage: GuildEventFormatter
    logError: typeof botLogError
    reportRuntimeError: DiscordRuntimeErrorReporter
  }
): Promise<DiscordGuildEventProcessingResult["delivery"]> {
  const configResult = await fetchRuntimeConfigQuietly(
    event,
    options.fetchConfig,
    options.logError
  )

  if (configResult?.status !== "ready") {
    return "configUnavailable"
  }

  const { loggingEnabled, logChannelId, logLevel } = configResult.config

  if (!loggingEnabled) {
    return "loggingDisabled"
  }

  if (!shouldMirrorDiscordGuildEvent(event.eventType, logLevel)) {
    return "filteredByLogLevel"
  }

  if (!logChannelId) {
    return "missingLogChannel"
  }

  const guild = context.guild

  if (!guild) {
    return "guildUnavailable"
  }

  const channel = await resolveConfiguredLogChannel(guild, logChannelId)

  if (!channel) {
    return "channelUnavailable"
  }

  if (!isTextSendableChannel(channel)) {
    return "channelUnsupported"
  }

  const botMember = guild.members.me

  if (!botMember) {
    return "botMemberUnavailable"
  }

  const permissions = channel.permissionsFor(botMember)

  if (!permissions?.has(baseLogPermissions)) {
    return "missingBasePermissions"
  }

  let message: MessageCreateOptions

  try {
    message = options.formatLogMessage(event)
  } catch (error) {
    options.logError("Discord guild event log formatting failed.", error, {
      discordGuildId: event.discordGuildId,
      eventName: event.eventType,
      discordChannelId: channel.id,
    })

    await reportGuildEventRuntimeError({
      error,
      event,
      operation: "formatGuildEventLog",
      message: "Discord guild event log formatting failed.",
      channelId: channel.id,
      logError: options.logError,
      reportRuntimeError: options.reportRuntimeError,
    })

    return "formatFailed"
  }

  try {
    await channel.send(message)
    return "sent"
  } catch (error) {
    options.logError("Discord guild event log delivery failed.", error, {
      discordGuildId: event.discordGuildId,
      eventName: event.eventType,
      discordChannelId: channel.id,
    })

    await reportGuildEventRuntimeError({
      error,
      event,
      operation: "sendGuildEventLog",
      message: "Discord guild event log delivery failed.",
      channelId: channel.id,
      logError: options.logError,
      reportRuntimeError: options.reportRuntimeError,
    })

    return "sendFailed"
  }
}

export function shouldMirrorDiscordGuildEvent(
  eventType: DiscordGuildEventRecord["eventType"],
  configuredLevel: DiscordGuildRuntimeConfigLogLevel | undefined
): boolean {
  const effectiveLevel = configuredLevel ?? "maximum"

  return (
    logLevelRank[effectiveLevel] >=
    logLevelRank[eventMinimumLogLevel[eventType]]
  )
}

export function normalizeGuildMemberAdd(
  member: GuildMember,
  occurredAt = member.joinedTimestamp ?? Date.now()
): DiscordGuildEventRecord {
  return {
    discordGuildId: member.guild.id,
    eventType: "guildMemberAdd",
    targetType: "member",
    targetDiscordId: member.id,
    targetDisplayName: member.displayName,
    metadata: {
      bot: member.user.bot,
    },
    occurredAt,
    dedupeKey: buildDedupeKey(
      "guildMemberAdd",
      member.guild.id,
      member.id,
      occurredAt
    ),
  }
}

export function normalizeGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
  occurredAt = Date.now()
): DiscordGuildEventRecord {
  return {
    discordGuildId: member.guild.id,
    eventType: "guildMemberRemove",
    targetType: "member",
    targetDiscordId: member.id,
    targetDisplayName: member.displayName,
    metadata: {
      bot: member.user.bot,
    },
    occurredAt,
    dedupeKey: buildDedupeKey(
      "guildMemberRemove",
      member.guild.id,
      member.id,
      occurredAt
    ),
  }
}

export function normalizeGuildBanAdd(
  ban: GuildBan,
  occurredAt = Date.now()
): DiscordGuildEventRecord {
  return {
    discordGuildId: ban.guild.id,
    eventType: "guildBanAdd",
    targetType: "user",
    targetDiscordId: ban.user.id,
    targetDisplayName: getUserDisplayName(ban.user),
    reason: ban.reason ?? undefined,
    occurredAt,
    dedupeKey: buildDedupeKey(
      "guildBanAdd",
      ban.guild.id,
      ban.user.id,
      occurredAt
    ),
  }
}

export function normalizeGuildBanRemove(
  ban: GuildBan,
  occurredAt = Date.now()
): DiscordGuildEventRecord {
  return {
    discordGuildId: ban.guild.id,
    eventType: "guildBanRemove",
    targetType: "user",
    targetDiscordId: ban.user.id,
    targetDisplayName: getUserDisplayName(ban.user),
    reason: ban.reason ?? undefined,
    occurredAt,
    dedupeKey: buildDedupeKey(
      "guildBanRemove",
      ban.guild.id,
      ban.user.id,
      occurredAt
    ),
  }
}

export function normalizeChannelCreate(
  channel: GuildBasedChannel,
  occurredAt = getTimestampOrNow(channel.createdTimestamp)
): DiscordGuildEventRecord {
  return {
    discordGuildId: channel.guild.id,
    eventType: "channelCreate",
    targetType: "channel",
    targetDiscordId: channel.id,
    targetDisplayName: "name" in channel ? channel.name : undefined,
    channelId: channel.id,
    metadata: {
      channelType: String(channel.type),
    },
    occurredAt,
    dedupeKey: buildDedupeKey(
      "channelCreate",
      channel.guild.id,
      channel.id,
      occurredAt
    ),
  }
}

export function normalizeChannelDelete(
  channel: GuildBasedChannel,
  occurredAt = Date.now()
): DiscordGuildEventRecord {
  return {
    discordGuildId: channel.guild.id,
    eventType: "channelDelete",
    targetType: "channel",
    targetDiscordId: channel.id,
    targetDisplayName: "name" in channel ? channel.name : undefined,
    channelId: channel.id,
    metadata: {
      channelType: String(channel.type),
    },
    occurredAt,
    dedupeKey: buildDedupeKey(
      "channelDelete",
      channel.guild.id,
      channel.id,
      occurredAt
    ),
  }
}

export function normalizeRoleCreate(
  role: Role,
  occurredAt = getTimestampOrNow(role.createdTimestamp)
): DiscordGuildEventRecord {
  return {
    discordGuildId: role.guild.id,
    eventType: "roleCreate",
    targetType: "role",
    targetDiscordId: role.id,
    targetDisplayName: role.name,
    roleId: role.id,
    occurredAt,
    dedupeKey: buildDedupeKey("roleCreate", role.guild.id, role.id, occurredAt),
  }
}

export function normalizeRoleDelete(
  role: Role,
  occurredAt = Date.now()
): DiscordGuildEventRecord {
  return {
    discordGuildId: role.guild.id,
    eventType: "roleDelete",
    targetType: "role",
    targetDiscordId: role.id,
    targetDisplayName: role.name,
    roleId: role.id,
    occurredAt,
    dedupeKey: buildDedupeKey("roleDelete", role.guild.id, role.id, occurredAt),
  }
}

export function normalizeMessageDelete(
  message: Message | PartialMessage,
  occurredAt = Date.now()
): DiscordGuildEventRecord | null {
  if (!message.guildId) {
    return null
  }

  return {
    discordGuildId: message.guildId,
    eventType: "messageDelete",
    targetType: "message",
    targetDiscordId: message.id,
    channelId: message.channelId,
    metadata: {
      partial: message.partial,
    },
    occurredAt,
    dedupeKey: buildDedupeKey(
      "messageDelete",
      message.guildId,
      message.id,
      occurredAt
    ),
  }
}

export function formatGuildEventLogMessage(
  event: DiscordGuildEventRecord
): MessageCreateOptions {
  const lines = [
    `**${formatEventType(event.eventType)}**`,
    `Target: ${formatTarget(event)}`,
    `Time: <t:${Math.floor(event.occurredAt / 1000)}:F>`,
    ...(event.actorDiscordUserId ? [`Actor: ${event.actorDiscordUserId}`] : []),
    ...(event.reason ? [`Reason: ${event.reason}`] : []),
  ]

  return {
    content: lines.join("\n"),
    allowedMentions: {
      parse: [],
      roles: [],
      users: [],
    },
  }
}

async function fetchRuntimeConfigQuietly(
  event: DiscordGuildEventRecord,
  fetchConfig: RuntimeConfigFetcher,
  logError: typeof botLogError
): Promise<DiscordGuildRuntimeConfigResult | null> {
  try {
    return await fetchConfig(event.discordGuildId)
  } catch (error) {
    logError("Discord guild event runtime config fetch failed.", error, {
      discordGuildId: event.discordGuildId,
      eventName: event.eventType,
    })

    return null
  }
}

async function resolveConfiguredLogChannel(
  guild: Guild,
  channelId: string
): Promise<GuildBasedChannel | null> {
  const cachedChannel = guild.channels.cache.get(channelId)

  if (cachedChannel) {
    return cachedChannel
  }

  try {
    return await guild.channels.fetch(channelId)
  } catch {
    return null
  }
}

function isTextSendableChannel(
  channel: GuildBasedChannel | null
): channel is LogSendableChannel {
  return Boolean(channel?.isTextBased() && channel.isSendable())
}

function getUserDisplayName(user: GuildBan["user"]): string {
  return user.globalName ?? user.displayName ?? user.username
}

function getTimestampOrNow(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value
  }

  return Date.now()
}

function buildDedupeKey(
  eventType: DiscordGuildEventRecord["eventType"],
  discordGuildId: string,
  subjectId: string,
  occurredAt: number
): string {
  return `${eventType}:${discordGuildId}:${subjectId}:${occurredAt}`
}

function formatEventType(
  eventType: DiscordGuildEventRecord["eventType"]
): string {
  switch (eventType) {
    case "guildMemberAdd":
      return "Member Joined"
    case "guildMemberRemove":
      return "Member Left"
    case "guildBanAdd":
      return "User Banned"
    case "guildBanRemove":
      return "User Unbanned"
    case "channelCreate":
      return "Channel Created"
    case "channelDelete":
      return "Channel Deleted"
    case "roleCreate":
      return "Role Created"
    case "roleDelete":
      return "Role Deleted"
    case "messageDelete":
      return "Message Deleted"
  }
}

function formatTarget(event: DiscordGuildEventRecord): string {
  const label = event.targetDisplayName?.trim()
  const id =
    event.targetDiscordId ?? event.channelId ?? event.roleId ?? "unknown target"

  return label ? `${label} (${id})` : id
}

async function reportGuildEventRuntimeError(args: {
  error: unknown
  event: DiscordGuildEventRecord
  operation: "persistGuildEvent" | "formatGuildEventLog" | "sendGuildEventLog"
  message: string
  channelId?: string
  logError: typeof botLogError
  reportRuntimeError: DiscordRuntimeErrorReporter
}) {
  try {
    await args.reportRuntimeError({
      severity: "error",
      serviceArea: "logging",
      message: args.message,
      error: args.error,
      discordGuildId: args.event.discordGuildId,
      eventName: args.event.eventType,
      operation: args.operation,
      fingerprint: args.channelId
        ? `logging:${args.operation}:${args.event.discordGuildId}:${args.channelId}:${args.event.eventType}`
        : `logging:${args.operation}:${args.event.discordGuildId}:${args.event.eventType}`,
      metadata: {
        eventType: args.event.eventType,
        targetType: args.event.targetType,
        targetDiscordId: args.event.targetDiscordId,
        channelId: args.channelId ?? args.event.channelId,
        roleId: args.event.roleId,
      },
    })
  } catch (reportError) {
    args.logError(
      "Discord guild event runtime error report failed.",
      reportError,
      {
        discordGuildId: args.event.discordGuildId,
        eventName: args.event.eventType,
        operation: args.operation,
        discordChannelId: args.channelId,
      }
    )
  }
}
