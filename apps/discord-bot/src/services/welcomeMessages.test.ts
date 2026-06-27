import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  PermissionFlagsBits,
  PermissionsBitField,
  type GuildMember,
  type MessageCreateOptions,
} from "discord.js"

import {
  handleGuildMemberWelcome,
  WELCOME_TEXT_FALLBACK_POLICY,
  type WelcomeMessageRenderer,
} from "./welcomeMessages"
import type {
  DiscordGuildRuntimeConfig,
  DiscordGuildRuntimeConfigDisabledReason,
  DiscordGuildRuntimeConfigResult,
} from "./guildRuntimeConfig"
import type { DiscordRuntimeErrorReportInput } from "./runtimeErrorReporter"

const guildId = "123456789012345678"
const channelId = "234567890123456789"
const memberId = "345678901234567890"

type ChannelDouble = {
  id: string
  sentMessages: MessageCreateOptions[]
  isTextBased: () => boolean
  isSendable: () => boolean
  send: (message: MessageCreateOptions) => Promise<unknown>
  permissionsFor: () => PermissionsBitField | null
}

type MemberDoubleOptions = {
  userBot?: boolean
  channel?: ChannelDouble | null
  fetchChannel?: ChannelDouble | null
}

function readyConfig(
  overrides: Partial<DiscordGuildRuntimeConfig> = {}
): DiscordGuildRuntimeConfigResult {
  return {
    status: "ready",
    config: {
      discordGuildId: guildId,
      moderationEnabled: false,
      welcomeEnabled: true,
      loggingEnabled: false,
      supportEnabled: false,
      welcomeChannelId: channelId,
      ...overrides,
    },
  }
}

function disabledConfig(
  reason: DiscordGuildRuntimeConfigDisabledReason
): DiscordGuildRuntimeConfigResult {
  return {
    status: "disabled",
    reason,
  }
}

function createChannel(
  overrides: Partial<ChannelDouble> & {
    permissions?: bigint[]
    sendError?: Error
  } = {}
): ChannelDouble {
  const sentMessages: MessageCreateOptions[] = []
  const permissions = new PermissionsBitField(
    overrides.permissions ?? [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ]
  )

  return {
    id: channelId,
    sentMessages,
    isTextBased: () => true,
    isSendable: () => true,
    permissionsFor: () => permissions,
    async send(message) {
      if (overrides.sendError) {
        throw overrides.sendError
      }

      sentMessages.push(message)
      return {}
    },
    ...overrides,
  }
}

function createMember({
  userBot = false,
  channel = createChannel(),
  fetchChannel = null,
}: MemberDoubleOptions = {}): GuildMember {
  const channels = new Map<string, ChannelDouble>()

  if (channel) {
    channels.set(channel.id, channel)
  }

  return {
    id: memberId,
    displayName: "Jason",
    user: {
      id: memberId,
      bot: userBot,
      username: "Jason",
    },
    guild: {
      id: guildId,
      name: "Cleo HQ",
      members: {
        me: {
          id: "456789012345678901",
        },
      },
      channels: {
        cache: channels,
        async fetch(id: string) {
          assert.equal(id, channelId)
          return fetchChannel
        },
      },
    },
  } as unknown as GuildMember
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

test("disabled config sends nothing", async () => {
  const channel = createChannel()
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return disabledConfig("missingConfig")
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(channel.sentMessages.length, 0)
  assert.equal(reporter.reports.length, 0)
})

test("unavailable and missing config send nothing", async () => {
  for (const configResult of [
    disabledConfig("convexUnavailable"),
    disabledConfig("missingConfig"),
  ]) {
    const channel = createChannel()
    const member = createMember({ channel })
    const reporter = createRuntimeErrorCollector()

    await handleGuildMemberWelcome(member, {
      async fetchConfig() {
        return configResult
      },
      reportRuntimeError: reporter.reportRuntimeError,
    })

    assert.equal(channel.sentMessages.length, 0)
    assert.equal(reporter.reports.length, 0)
  }
})

test("enabled config sends one welcome message to configured channel", async () => {
  const channel = createChannel()
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return readyConfig()
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(channel.sentMessages.length, 1)
  assert.equal(
    channel.sentMessages[0]?.content,
    "Welcome <@345678901234567890> to Cleo HQ"
  )
  assert.equal(channel.sentMessages[0]?.files?.length, 1)
  assert.equal(reporter.reports.length, 0)
})

test("welcome requires both enabled flag and configured channel", async () => {
  for (const configResult of [
    readyConfig({ welcomeEnabled: false }),
    readyConfig({ welcomeChannelId: undefined }),
  ]) {
    const channel = createChannel()
    const member = createMember({ channel })
    const reporter = createRuntimeErrorCollector()

    await handleGuildMemberWelcome(member, {
      async fetchConfig() {
        return configResult
      },
      reportRuntimeError: reporter.reportRuntimeError,
    })

    assert.equal(channel.sentMessages.length, 0)
    assert.equal(reporter.reports.length, 0)
  }
})

test("bot member is ignored", async () => {
  const channel = createChannel()
  const member = createMember({ channel, userBot: true })
  const reporter = createRuntimeErrorCollector()
  let fetchedConfig = false

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      fetchedConfig = true
      return readyConfig()
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(fetchedConfig, false)
  assert.equal(channel.sentMessages.length, 0)
  assert.equal(reporter.reports.length, 0)
})

test("missing channel fails safely", async () => {
  const member = createMember({ channel: null, fetchChannel: null })
  const reporter = createRuntimeErrorCollector()
  let rendered = false

  await assert.doesNotReject(async () => {
    await handleGuildMemberWelcome(member, {
      async fetchConfig() {
        return readyConfig()
      },
      renderWelcomeMessage() {
        rendered = true
        return { content: "should not render" }
      },
      reportRuntimeError: reporter.reportRuntimeError,
    })
  })

  assert.equal(rendered, false)
  assert.equal(reporter.reports.length, 0)
})

test("unsupported channel type fails safely", async () => {
  const channel = createChannel({
    isTextBased: () => false,
  })
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()
  let rendered = false

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return readyConfig()
    },
    renderWelcomeMessage() {
      rendered = true
      return { content: "should not render" }
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(rendered, false)
  assert.equal(channel.sentMessages.length, 0)
  assert.equal(reporter.reports.length, 0)
})

test("missing send permission fails safely before render", async () => {
  const channel = createChannel({
    permissions: [PermissionFlagsBits.ViewChannel],
  })
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()
  let rendered = false

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return readyConfig()
    },
    renderWelcomeMessage() {
      rendered = true
      return { content: "should not render" }
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(rendered, false)
  assert.equal(channel.sentMessages.length, 0)
  assert.equal(reporter.reports.length, 0)
})

test("missing attach permission uses text fallback before card render", async () => {
  const channel = createChannel({
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ],
  })
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()
  let rendered = false

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return readyConfig()
    },
    renderWelcomeMessage() {
      rendered = true
      return { content: "should not render" }
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(rendered, false)
  assert.equal(channel.sentMessages.length, 1)
  assert.equal(
    channel.sentMessages[0]?.content,
    "Welcome <@345678901234567890> to Cleo HQ"
  )
  assert.equal(channel.sentMessages[0]?.files, undefined)
  assert.equal(reporter.reports.length, 0)
})

test("renderer failure uses text fallback policy and reports warning", async () => {
  const channel = createChannel()
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()
  const loggedErrors: unknown[] = []

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return readyConfig()
    },
    renderWelcomeMessage() {
      throw new Error("renderer failed")
    },
    logError(message, error, metadata) {
      loggedErrors.push({ message, error, metadata })
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(channel.sentMessages.length, 1)
  assert.equal(
    channel.sentMessages[0]?.content,
    "Welcome <@345678901234567890> to Cleo HQ"
  )
  assert.equal(
    (loggedErrors[0] as { metadata: { fallbackPolicy: string } }).metadata
      .fallbackPolicy,
    WELCOME_TEXT_FALLBACK_POLICY
  )

  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.severity, "warn")
  assert.equal(reporter.reports[0]?.serviceArea, "welcome")
  assert.equal(
    reporter.reports[0]?.message,
    "Discord welcome card rendering failed."
  )
  assert.equal(reporter.reports[0]?.discordGuildId, guildId)
  assert.equal(reporter.reports[0]?.eventName, "guildMemberAdd")
  assert.equal(reporter.reports[0]?.operation, "renderWelcomeCard")
  assert.equal(
    reporter.reports[0]?.fingerprint,
    `welcome:renderWelcomeCard:${guildId}:${channelId}`
  )
  assert.deepEqual(reporter.reports[0]?.metadata, {
    userId: memberId,
    channelId,
  })
})

test("send failure is caught, logged, and reports error", async () => {
  const channel = createChannel({
    sendError: new Error("send failed"),
  })
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()
  const loggedErrors: unknown[] = []

  await assert.doesNotReject(async () => {
    await handleGuildMemberWelcome(member, {
      async fetchConfig() {
        return readyConfig()
      },
      logError(message, error, metadata) {
        loggedErrors.push({ message, error, metadata })
      },
      reportRuntimeError: reporter.reportRuntimeError,
    })
  })

  assert.equal(channel.sentMessages.length, 0)
  assert.equal(
    (loggedErrors[0] as { message: string }).message,
    "Discord welcome message send failed."
  )

  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.severity, "error")
  assert.equal(reporter.reports[0]?.serviceArea, "welcome")
  assert.equal(
    reporter.reports[0]?.message,
    "Discord welcome message delivery failed."
  )
  assert.equal(reporter.reports[0]?.discordGuildId, guildId)
  assert.equal(reporter.reports[0]?.eventName, "guildMemberAdd")
  assert.equal(reporter.reports[0]?.operation, "sendWelcomeMessage")
  assert.equal(
    reporter.reports[0]?.fingerprint,
    `welcome:sendWelcomeMessage:${guildId}:${channelId}`
  )
  assert.deepEqual(reporter.reports[0]?.metadata, {
    userId: memberId,
    channelId,
  })
})

test("runtime report failure during welcome send is logged and swallowed", async () => {
  const channel = createChannel({
    sendError: new Error("send failed"),
  })
  const member = createMember({ channel })
  const loggedErrors: unknown[] = []

  await assert.doesNotReject(async () => {
    await handleGuildMemberWelcome(member, {
      async fetchConfig() {
        return readyConfig()
      },
      logError(message, error, metadata) {
        loggedErrors.push({ message, error, metadata })
      },
      async reportRuntimeError() {
        throw new Error("report failed")
      },
    })
  })

  assert.equal(channel.sentMessages.length, 0)
  assert.equal(
    (loggedErrors[0] as { message: string }).message,
    "Discord welcome message send failed."
  )
  assert.equal(
    (loggedErrors[1] as { message: string }).message,
    "Discord welcome runtime error report failed."
  )
})

test("rich renderer falls back to text when rich permissions are missing", async () => {
  const channel = createChannel({
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ],
  })
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()
  const renderWelcomeMessage: WelcomeMessageRenderer = () => ({
    content: "rich welcome",
    embeds: [],
    files: [{ attachment: Buffer.from("welcome") }],
  })

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return readyConfig()
    },
    renderWelcomeMessage,
    renderRequiresAttachFiles: false,
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(channel.sentMessages.length, 1)
  assert.equal(
    channel.sentMessages[0]?.content,
    "Welcome <@345678901234567890> to Cleo HQ"
  )
  assert.equal(channel.sentMessages[0]?.files, undefined)
  assert.equal(reporter.reports.length, 0)
})

test("embed renderer falls back to text when embed permission is missing", async () => {
  const channel = createChannel({
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ],
  })
  const member = createMember({ channel })
  const reporter = createRuntimeErrorCollector()
  const renderWelcomeMessage: WelcomeMessageRenderer = () => ({
    content: "embed welcome",
    embeds: [
      {
        description: "Welcome from Cleo",
      },
    ],
  })

  await handleGuildMemberWelcome(member, {
    async fetchConfig() {
      return readyConfig()
    },
    renderWelcomeMessage,
    renderRequiresAttachFiles: false,
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.equal(channel.sentMessages.length, 1)
  assert.equal(
    channel.sentMessages[0]?.content,
    "Welcome <@345678901234567890> to Cleo HQ"
  )
  assert.equal(channel.sentMessages[0]?.embeds, undefined)
  assert.equal(reporter.reports.length, 0)
})

test("welcome handler uses cached runtime-config service and runtime reporter service", () => {
  const source = readFileSync(
    new URL("./welcomeMessages.ts", import.meta.url),
    "utf8"
  )

  assert.match(source, /fetchDiscordGuildRuntimeConfig/)
  assert.match(source, /reportDiscordRuntimeError/)
  assert.doesNotMatch(source, /convexBotClient/)
  assert.doesNotMatch(source, /_generated\/api/)
})
