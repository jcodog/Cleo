import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
  type GuildBan,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
  type Role,
} from "discord.js"

import {
  convexBotClient,
  type DiscordGuildEventRecord,
} from "./convexBotClient"
import { clearDiscordGuildRuntimeConfigCache } from "./guildRuntimeConfig"
import {
  formatGuildEventLogMessage,
  handleDiscordGuildEvent,
  normalizeChannelCreate,
  normalizeChannelDelete,
  normalizeGuildBanAdd,
  normalizeGuildBanRemove,
  normalizeGuildMemberAdd,
  normalizeGuildMemberRemove,
  normalizeMessageDelete,
  normalizeRoleCreate,
  normalizeRoleDelete,
  shouldMirrorDiscordGuildEvent,
} from "./guildEventLogging"
import type { DiscordRuntimeErrorReportInput } from "./runtimeErrorReporter"
import type { DiscordGuildRuntimeConfigResult } from "./guildRuntimeConfig"

const guildId = "123456789012345678"
const userId = "234567890123456789"
const channelId = "345678901234567890"
const roleId = "456789012345678901"
const messageId = "567890123456789012"
const logChannelId = "678901234567890123"
const now = 1_800_000_000_000

type ChannelDouble = {
  id: string
  guild: Guild
  name: string
  type: number
  sentMessages: MessageCreateOptions[]
  sendError?: Error
  isTextBased: () => boolean
  isSendable: () => boolean
  permissionsFor: () => PermissionsBitField | null
  send: (message: MessageCreateOptions) => Promise<unknown>
}

type ChannelDoubleOverrides = Partial<
  Omit<ChannelDouble, "permissionsFor" | "toString">
> & {
  permissions?: bigint[]
  permissionsFor?: () => PermissionsBitField | null
}

function readyConfig(
  overrides: Partial<
    Extract<DiscordGuildRuntimeConfigResult, { status: "ready" }>["config"]
  > = {}
): DiscordGuildRuntimeConfigResult {
  return {
    status: "ready",
    config: {
      discordGuildId: guildId,
      moderationEnabled: false,
      welcomeEnabled: false,
      loggingEnabled: true,
      supportEnabled: false,
      logLevel: "maximum",
      logChannelId,
      ...overrides,
    },
  }
}

function createChannel(overrides: ChannelDoubleOverrides = {}): ChannelDouble {
  const sentMessages: MessageCreateOptions[] = []
  const permissions = new PermissionsBitField(
    overrides.permissions ?? [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]
  )

  const channel = {
    id: overrides.id ?? logChannelId,
    guild: undefined as unknown as Guild,
    name: "server-log",
    type: 0,
    sentMessages,
    isTextBased: () => true,
    isSendable: () => true,
    permissionsFor: () => permissions,
    async send(message: MessageCreateOptions) {
      if (overrides.sendError) {
        throw overrides.sendError
      }

      sentMessages.push(message)
      return {}
    },
    ...overrides,
  }

  return channel as ChannelDouble
}

function createGuild(channel: ChannelDouble | null = createChannel()): Guild {
  const channels = new Map<string, ChannelDouble>()

  if (channel) {
    channels.set(channel.id, channel)
  }

  const guild = {
    id: guildId,
    name: "Cleo HQ",
    members: {
      me: {
        id: "789012345678901234",
      },
    },
    channels: {
      cache: channels,
      async fetch(id: string) {
        assert.equal(id, logChannelId)
        return null
      },
    },
  } as unknown as Guild

  if (channel) {
    ;(channel as { guild: Guild }).guild = guild
  }

  return guild
}

function createMember(guild = createGuild()): GuildMember {
  return {
    id: userId,
    displayName: "Jason",
    joinedTimestamp: now - 1_000,
    user: {
      id: userId,
      bot: false,
    },
    guild,
  } as unknown as GuildMember
}

function createBan(guild = createGuild()): GuildBan {
  return {
    guild,
    reason: "Policy violation",
    user: {
      id: userId,
      username: "jason",
      displayName: "Jason",
      globalName: null,
    },
  } as unknown as GuildBan
}

function createRole(guild = createGuild()): Role {
  return {
    id: roleId,
    name: "Mods",
    guild,
    createdTimestamp: now - 500,
  } as unknown as Role
}

function createGuildChannel(guild = createGuild()): GuildBasedChannel {
  return {
    id: channelId,
    name: "general",
    type: 0,
    guild,
    createdTimestamp: now - 500,
  } as unknown as GuildBasedChannel
}

function createMessage(guild = createGuild()): Message {
  return {
    id: messageId,
    guildId,
    guild,
    channelId,
    partial: false,
    content: "raw message content must not be stored",
  } as unknown as Message
}

function createRuntimeErrorCollector() {
  const reports: DiscordRuntimeErrorReportInput[] = []

  return {
    reports,
    async reportRuntimeError(input: DiscordRuntimeErrorReportInput) {
      reports.push(input)
      return null
    },
  }
}

function createPersistRecorder(deduplicated = false) {
  const events: DiscordGuildEventRecord[] = []

  return {
    events,
    async persistEvent(event: DiscordGuildEventRecord) {
      events.push(event)
      return {
        id: "event-id",
        deduplicated,
      } as never
    },
  }
}

test("bot event normalization works for each supported guild event", () => {
  const guild = createGuild()
  const member = createMember(guild)
  const ban = createBan(guild)
  const channel = createGuildChannel(guild)
  const role = createRole(guild)
  const message = createMessage(guild)

  const events = [
    normalizeGuildMemberAdd(member, now),
    normalizeGuildMemberRemove(member, now),
    normalizeGuildBanAdd(ban, now),
    normalizeGuildBanRemove(ban, now),
    normalizeChannelCreate(channel, now),
    normalizeChannelDelete(channel, now),
    normalizeRoleCreate(role, now),
    normalizeRoleDelete(role, now),
    normalizeMessageDelete(message, now),
  ]

  assert.deepEqual(
    events.map((event) => event?.eventType),
    [
      "guildMemberAdd",
      "guildMemberRemove",
      "guildBanAdd",
      "guildBanRemove",
      "channelCreate",
      "channelDelete",
      "roleCreate",
      "roleDelete",
      "messageDelete",
    ]
  )

  assert.deepEqual(
    events.map((event) => event?.discordGuildId),
    [
      guildId,
      guildId,
      guildId,
      guildId,
      guildId,
      guildId,
      guildId,
      guildId,
      guildId,
    ]
  )
})

test("messageDelete normalization does not include raw message content", () => {
  const event = normalizeMessageDelete(createMessage(), now)

  assert.notEqual(event, null)
  assert.equal(JSON.stringify(event).includes("raw message content"), false)
  assert.equal(
    Object.prototype.hasOwnProperty.call(event?.metadata ?? {}, "content"),
    false
  )
})

test("messageDelete ignores direct messages", () => {
  const message = {
    ...createMessage(),
    guildId: null,
  } as unknown as Message

  assert.equal(normalizeMessageDelete(message, now), null)
})

test("disabled logging still persists and sends nothing", async () => {
  const channel = createChannel()
  const guild = createGuild(channel)
  const event = normalizeGuildMemberAdd(createMember(guild), now)
  const reporter = createRuntimeErrorCollector()
  const persister = createPersistRecorder()

  const result = await handleDiscordGuildEvent(
    event,
    { guild },
    {
      async fetchConfig() {
        return readyConfig({ loggingEnabled: false })
      },
      persistEvent: persister.persistEvent,
      reportRuntimeError: reporter.reportRuntimeError,
    }
  )

  assert.deepEqual(result, {
    persistence: "recorded",
    delivery: "loggingDisabled",
  })
  assert.equal(persister.events.length, 1)
  assert.equal(channel.sentMessages.length, 0)
  assert.equal(reporter.reports.length, 0)
})

test("enabled logging sends configured log message", async () => {
  const channel = createChannel()
  const guild = createGuild(channel)
  const event = normalizeGuildMemberAdd(createMember(guild), now)
  const reporter = createRuntimeErrorCollector()
  const persister = createPersistRecorder()

  const result = await handleDiscordGuildEvent(
    event,
    { guild },
    {
      async fetchConfig() {
        return readyConfig()
      },
      persistEvent: persister.persistEvent,
      reportRuntimeError: reporter.reportRuntimeError,
    }
  )

  assert.deepEqual(result, {
    persistence: "recorded",
    delivery: "sent",
  })
  assert.equal(channel.sentMessages.length, 1)
  assert.match(channel.sentMessages[0]?.content ?? "", /Member Joined/)
  assert.match(channel.sentMessages[0]?.content ?? "", /Jason/)
  assert.deepEqual(channel.sentMessages[0]?.allowedMentions, {
    parse: [],
    roles: [],
    users: [],
  })
  assert.equal(reporter.reports.length, 0)
})

test("default event dependencies persist and deliver through runtime config", async () => {
  const originalFetch = convexBotClient.fetchGuildRuntimeConfig
  const originalPersist = convexBotClient.recordGuildEvent
  const persistedEvents: DiscordGuildEventRecord[] = []
  const channel = createChannel()
  const guild = createGuild(channel)
  const event = normalizeGuildMemberAdd(createMember(guild), now)

  convexBotClient.fetchGuildRuntimeConfig = async () => readyConfig()
  convexBotClient.recordGuildEvent = async (record) => {
    persistedEvents.push(record)
    return {
      id: "event-id",
      deduplicated: false,
    } as never
  }
  clearDiscordGuildRuntimeConfigCache()

  try {
    const result = await handleDiscordGuildEvent(event, { guild })
    assert.deepEqual(result, {
      persistence: "recorded",
      delivery: "sent",
    })
  } finally {
    convexBotClient.fetchGuildRuntimeConfig = originalFetch
    convexBotClient.recordGuildEvent = originalPersist
    clearDiscordGuildRuntimeConfigCache()
  }

  assert.equal(persistedEvents.length, 1)
  assert.equal(channel.sentMessages.length, 1)
})

test("guild logging levels apply a stable event policy", () => {
  assert.equal(shouldMirrorDiscordGuildEvent("guildBanAdd", "minimal"), true)
  assert.equal(
    shouldMirrorDiscordGuildEvent("guildMemberAdd", "minimal"),
    false
  )
  assert.equal(shouldMirrorDiscordGuildEvent("guildMemberAdd", "medium"), true)
  assert.equal(shouldMirrorDiscordGuildEvent("messageDelete", "medium"), false)
  assert.equal(shouldMirrorDiscordGuildEvent("messageDelete", "maximum"), true)
  assert.equal(shouldMirrorDiscordGuildEvent("guildBanAdd", "none"), false)
  assert.equal(shouldMirrorDiscordGuildEvent("messageDelete", undefined), true)
})

test("events below the configured log level persist without delivery", async () => {
  const channel = createChannel()
  const guild = createGuild(channel)
  const event = normalizeMessageDelete(createMessage(guild), now)

  if (!event) {
    throw new Error("Expected a guild message event.")
  }

  const result = await handleDiscordGuildEvent(
    event,
    { guild },
    {
      async fetchConfig() {
        return readyConfig({ logLevel: "medium" })
      },
      persistEvent: createPersistRecorder().persistEvent,
    }
  )

  assert.deepEqual(result, {
    persistence: "recorded",
    delivery: "filteredByLogLevel",
  })
  assert.equal(channel.sentMessages.length, 0)
})

test("deduplicated events do not fetch config or deliver twice", async () => {
  const channel = createChannel()
  const guild = createGuild(channel)
  const event = normalizeGuildMemberAdd(createMember(guild), now)
  let configFetches = 0

  const result = await handleDiscordGuildEvent(
    event,
    { guild },
    {
      async fetchConfig() {
        configFetches += 1
        return readyConfig()
      },
      persistEvent: createPersistRecorder(true).persistEvent,
    }
  )

  assert.deepEqual(result, {
    persistence: "recorded",
    delivery: "deduplicated",
  })
  assert.equal(configFetches, 0)
  assert.equal(channel.sentMessages.length, 0)
})

test("missing or unsupported log channel sends nothing quietly", async () => {
  const reporter = createRuntimeErrorCollector()

  for (const channel of [
    null,
    createChannel({
      isTextBased: () => false,
    }),
  ]) {
    const guild = createGuild(channel)
    const event = normalizeGuildMemberAdd(createMember(guild), now)

    const result = await handleDiscordGuildEvent(
      event,
      { guild },
      {
        async fetchConfig() {
          return readyConfig()
        },
        persistEvent: createPersistRecorder().persistEvent,
        reportRuntimeError: reporter.reportRuntimeError,
      }
    )

    assert.equal(result.persistence, "recorded")
    assert.match(result.delivery, /channelUnavailable|channelUnsupported/)
  }

  assert.equal(reporter.reports.length, 0)
})

test("delivery prerequisites fail closed without incidents", async () => {
  const event = normalizeGuildMemberAdd(createMember(), now)
  const cases = [
    {
      expected: "configUnavailable",
      context: { guild: createGuild() },
      fetchConfig: async () =>
        ({
          status: "disabled",
          reason: "missingConfig",
        }) as DiscordGuildRuntimeConfigResult,
    },
    {
      expected: "missingLogChannel",
      context: { guild: createGuild() },
      fetchConfig: async () => readyConfig({ logChannelId: undefined }),
    },
    {
      expected: "guildUnavailable",
      context: {},
      fetchConfig: async () => readyConfig(),
    },
    {
      expected: "botMemberUnavailable",
      context: {
        guild: {
          ...createGuild(),
          members: { me: null },
        } as unknown as Guild,
      },
      fetchConfig: async () => readyConfig(),
    },
    {
      expected: "missingBasePermissions",
      context: {
        guild: createGuild(
          createChannel({
            permissionsFor: () => null,
          })
        ),
      },
      fetchConfig: async () => readyConfig(),
    },
  ]

  for (const item of cases) {
    const result = await handleDiscordGuildEvent(event, item.context, {
      fetchConfig: item.fetchConfig,
      persistEvent: createPersistRecorder().persistEvent,
    })

    assert.equal(result.delivery, item.expected)
  }
})

test("runtime config and channel fetch failures are non-fatal", async () => {
  const event = normalizeGuildMemberAdd(createMember(), now)
  const loggedErrors: unknown[] = []
  const configResult = await handleDiscordGuildEvent(
    event,
    { guild: createGuild() },
    {
      async fetchConfig() {
        throw new Error("config fetch failed")
      },
      persistEvent: createPersistRecorder().persistEvent,
      logError(message, error, metadata) {
        loggedErrors.push({ message, error, metadata })
      },
    }
  )

  const guild = createGuild(null)
  guild.channels.fetch = async () => {
    throw new Error("channel fetch failed")
  }
  const channelResult = await handleDiscordGuildEvent(
    event,
    { guild },
    {
      async fetchConfig() {
        return readyConfig()
      },
      persistEvent: createPersistRecorder().persistEvent,
    }
  )

  assert.equal(configResult.delivery, "configUnavailable")
  assert.equal(channelResult.delivery, "channelUnavailable")
  assert.equal(loggedErrors.length, 1)
})

test("missing expected permissions sends nothing and does not report incident", async () => {
  const channel = createChannel({
    permissions: [PermissionFlagsBits.ViewChannel],
  })
  const guild = createGuild(channel)
  const event = normalizeGuildMemberAdd(createMember(guild), now)
  const reporter = createRuntimeErrorCollector()

  const result = await handleDiscordGuildEvent(
    event,
    { guild },
    {
      async fetchConfig() {
        return readyConfig()
      },
      persistEvent: createPersistRecorder().persistEvent,
      reportRuntimeError: reporter.reportRuntimeError,
    }
  )

  assert.deepEqual(result, {
    persistence: "recorded",
    delivery: "missingBasePermissions",
  })
  assert.equal(channel.sentMessages.length, 0)
  assert.equal(reporter.reports.length, 0)
})

test("unexpected persistence failure is logged and reported safely", async () => {
  const guild = createGuild()
  const event = normalizeGuildMemberAdd(createMember(guild), now)
  const reporter = createRuntimeErrorCollector()
  const loggedErrors: unknown[] = []

  const result = await handleDiscordGuildEvent(
    event,
    { guild },
    {
      async fetchConfig() {
        return readyConfig({ loggingEnabled: false })
      },
      async persistEvent() {
        return null
      },
      logError(message, error, metadata) {
        loggedErrors.push({ message, error, metadata })
      },
      reportRuntimeError: reporter.reportRuntimeError,
    }
  )

  assert.deepEqual(result, {
    persistence: "failed",
    delivery: "loggingDisabled",
  })
  assert.equal(
    (loggedErrors[0] as { message: string }).message,
    "Discord guild event persistence failed."
  )
  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.serviceArea, "logging")
  assert.equal(reporter.reports[0]?.operation, "persistGuildEvent")
})

test("formatter and send failures are logged and reported safely", async () => {
  const formatterFailureReporter = createRuntimeErrorCollector()
  const formatterLoggedErrors: unknown[] = []
  const formatterChannel = createChannel()
  const formatterGuild = createGuild(formatterChannel)
  const event = normalizeGuildMemberAdd(createMember(formatterGuild), now)

  const formatterResult = await handleDiscordGuildEvent(
    event,
    {
      guild: formatterGuild,
    },
    {
      async fetchConfig() {
        return readyConfig()
      },
      persistEvent: createPersistRecorder().persistEvent,
      formatLogMessage() {
        throw new Error("formatter failed")
      },
      logError(message, error, metadata) {
        formatterLoggedErrors.push({ message, error, metadata })
      },
      reportRuntimeError: formatterFailureReporter.reportRuntimeError,
    }
  )

  assert.equal(formatterResult.delivery, "formatFailed")
  assert.equal(formatterChannel.sentMessages.length, 0)
  assert.equal(
    formatterFailureReporter.reports[0]?.operation,
    "formatGuildEventLog"
  )

  const sendFailureReporter = createRuntimeErrorCollector()
  const sendLoggedErrors: unknown[] = []
  const sendChannel = createChannel({
    sendError: new Error("send failed"),
  })
  const sendGuild = createGuild(sendChannel)

  const sendResult = await handleDiscordGuildEvent(
    event,
    { guild: sendGuild },
    {
      async fetchConfig() {
        return readyConfig()
      },
      persistEvent: createPersistRecorder().persistEvent,
      logError(message, error, metadata) {
        sendLoggedErrors.push({ message, error, metadata })
      },
      reportRuntimeError: sendFailureReporter.reportRuntimeError,
    }
  )

  assert.equal(sendResult.delivery, "sendFailed")
  assert.equal(sendFailureReporter.reports[0]?.operation, "sendGuildEventLog")
  assert.equal(
    (sendLoggedErrors[0] as { message: string }).message,
    "Discord guild event log delivery failed."
  )
})

test("runtime reporter failure during guild event handling is swallowed", async () => {
  const guild = createGuild()
  const event = normalizeGuildMemberAdd(createMember(guild), now)
  const loggedErrors: unknown[] = []

  await assert.doesNotReject(async () => {
    await handleDiscordGuildEvent(
      event,
      { guild },
      {
        async fetchConfig() {
          return readyConfig({ loggingEnabled: false })
        },
        async persistEvent() {
          throw new Error("persist failed")
        },
        logError(message, error, metadata) {
          loggedErrors.push({ message, error, metadata })
        },
        async reportRuntimeError() {
          throw new Error("report failed")
        },
      }
    )
  })

  assert.equal(
    (loggedErrors[1] as { message: string }).message,
    "Discord guild event runtime error report failed."
  )
})

test("guild event formatter is simple and readable", () => {
  const message = formatGuildEventLogMessage({
    discordGuildId: guildId,
    eventType: "messageDelete",
    targetType: "message",
    targetDiscordId: messageId,
    channelId,
    occurredAt: now,
    dedupeKey: `messageDelete:${guildId}:${messageId}:${now}`,
  })

  assert.match(message.content ?? "", /Message Deleted/)
  assert.match(message.content ?? "", new RegExp(messageId))
  assert.doesNotMatch(message.content ?? "", /raw/i)
})

test("normalizers cover Discord fallback fields and timestamps", () => {
  const guild = createGuild()
  const fallbackBan = {
    ...createBan(guild),
    reason: null,
    user: {
      id: userId,
      username: "fallback-user",
      displayName: null,
      globalName: null,
    },
  } as unknown as GuildBan
  const globalBan = {
    ...fallbackBan,
    user: {
      ...fallbackBan.user,
      globalName: "Global Name",
    },
  } as unknown as GuildBan
  const unnamedChannel = {
    id: channelId,
    type: 0,
    guild,
    createdTimestamp: null,
  } as unknown as GuildBasedChannel
  const invalidTimestampRole = {
    ...createRole(guild),
    createdTimestamp: 0,
  } as unknown as Role

  assert.equal(
    normalizeGuildBanAdd(fallbackBan, now).targetDisplayName,
    "fallback-user"
  )
  assert.equal(
    normalizeGuildBanRemove(globalBan, now).targetDisplayName,
    "Global Name"
  )
  assert.equal(normalizeGuildBanAdd(fallbackBan, now).reason, undefined)
  assert.equal(
    normalizeChannelCreate(unnamedChannel).targetDisplayName,
    undefined
  )
  assert.equal(
    normalizeChannelDelete(unnamedChannel, now).targetDisplayName,
    undefined
  )
  assert.ok(normalizeChannelCreate(unnamedChannel).occurredAt > 0)
  assert.equal(
    normalizeGuildMemberAdd(createMember(guild)).occurredAt,
    now - 1_000
  )
  assert.ok(
    normalizeGuildMemberAdd({
      ...createMember(guild),
      joinedTimestamp: null,
    } as unknown as GuildMember).occurredAt > 0
  )
  assert.equal(normalizeRoleCreate(createRole(guild)).occurredAt, now - 500)
  assert.ok(normalizeRoleCreate(invalidTimestampRole).occurredAt > 0)
})

test("formatter includes actor and reason and falls back to channel targets", () => {
  const message = formatGuildEventLogMessage({
    discordGuildId: guildId,
    eventType: "channelDelete",
    targetType: "channel",
    channelId,
    actorDiscordUserId: userId,
    reason: "cleanup token=secret user@example.com",
    occurredAt: now,
    dedupeKey: `channelDelete:${guildId}:${channelId}:${now}`,
  })

  assert.match(message.content ?? "", new RegExp(`Actor: ${userId}`))
  assert.match(
    message.content ?? "",
    /Reason: cleanup token=\[redacted\] \[redacted\]/
  )
  assert.match(message.content ?? "", new RegExp(channelId))

  const unknownTarget = formatGuildEventLogMessage({
    discordGuildId: guildId,
    eventType: "messageDelete",
    targetType: "message",
    occurredAt: now,
    dedupeKey: `messageDelete:${guildId}:${now}`,
  })

  assert.match(unknownTarget.content ?? "", /unknown target/)
})

test("guild event formatter labels all supported event types", () => {
  const cases: Array<{
    eventType: DiscordGuildEventRecord["eventType"]
    label: string
    overrides: Partial<DiscordGuildEventRecord>
  }> = [
    {
      eventType: "guildMemberAdd",
      label: "Member Joined",
      overrides: {
        targetType: "member",
        targetDiscordId: userId,
        targetDisplayName: "Jason",
      },
    },
    {
      eventType: "guildMemberRemove",
      label: "Member Left",
      overrides: {
        targetType: "member",
        targetDiscordId: userId,
      },
    },
    {
      eventType: "guildBanAdd",
      label: "User Banned",
      overrides: {
        targetType: "user",
        targetDiscordId: userId,
      },
    },
    {
      eventType: "guildBanRemove",
      label: "User Unbanned",
      overrides: {
        targetType: "user",
        targetDiscordId: userId,
      },
    },
    {
      eventType: "channelCreate",
      label: "Channel Created",
      overrides: {
        targetType: "channel",
        channelId,
      },
    },
    {
      eventType: "channelDelete",
      label: "Channel Deleted",
      overrides: {
        targetType: "channel",
        channelId,
      },
    },
    {
      eventType: "roleCreate",
      label: "Role Created",
      overrides: {
        targetType: "role",
        roleId,
      },
    },
    {
      eventType: "roleDelete",
      label: "Role Deleted",
      overrides: {
        targetType: "role",
        roleId,
      },
    },
  ]

  for (const { eventType, label, overrides } of cases) {
    const message = formatGuildEventLogMessage({
      discordGuildId: guildId,
      eventType,
      targetType: "message",
      occurredAt: now,
      dedupeKey: `${eventType}:${guildId}:${now}`,
      ...overrides,
    })

    assert.match(message.content ?? "", new RegExp(label))
  }
})

test("guild event logging uses cached runtime-config service", () => {
  const source = readFileSync(
    new URL("./guildEventLogging.ts", import.meta.url),
    "utf8"
  )

  assert.match(source, /fetchDiscordGuildRuntimeConfig/)
  assert.match(source, /reportDiscordRuntimeError/)
})
