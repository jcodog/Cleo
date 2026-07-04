import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js"

import { convexBotClient } from "./convexBotClient"
import type {
  DiscordSupportTicketOpenInput,
  DiscordSupportTicketOpenResult,
} from "./convexBotClient"
import { clearDiscordGuildRuntimeConfigCache } from "./guildRuntimeConfig"
import {
  formatSupportStaffMessage,
  handleHelpCommand,
  isGuildSupportReady,
  isUserInstallInteraction,
} from "./supportTickets"

const userId = "123456789012345678"
const guildId = "234567890123456789"
const targetId = "345678901234567890"
const roleId = "456789012345678901"

function createInteraction(options: { guildId?: string; message?: string }) {
  const replies: unknown[] = []

  return {
    replies,
    interaction: {
      commandName: "help",
      authorizingIntegrationOwners: options.guildId
        ? {
            0: options.guildId,
          }
        : {
            1: userId,
          },
      guildId: options.guildId ?? null,
      guild: options.guildId ? ({ id: options.guildId } as never) : null,
      user: {
        id: userId,
        username: "Jason",
      },
      options: {
        getString(name: string, required?: boolean) {
          assert.equal(name, "message")

          if (required && options.message === undefined) {
            throw new Error("Missing required option")
          }

          return options.message ?? null
        },
      },
      async reply(message: unknown) {
        replies.push(message)
      },
    } as unknown as ChatInputCommandInteraction,
  }
}

function readyConfig(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready" as const,
    config: {
      discordGuildId: guildId,
      moderationEnabled: false,
      welcomeEnabled: false,
      loggingEnabled: false,
      supportEnabled: true,
      supportStaffRoleIds: [roleId],
      supportTargetId: targetId,
      supportTargetType: "channel" as const,
      supportTranscriptPolicy: "explicit-messages" as const,
      supportEscalationPolicy: "jcn-product-only" as const,
      ...overrides,
    },
  }
}

function openedResult(
  scope: "jcn" | "guild"
): Exclude<
  DiscordSupportTicketOpenResult,
  { status: "guildSupportUnavailable" }
> {
  return {
    status: "opened",
    ticketId: "ticket-id" as never,
    scope,
    ...(scope === "guild"
      ? {
          route: {
            targetId,
            targetType: "channel" as const,
            staffRoleIds: [roleId],
          },
        }
      : {}),
    submittedMessage: "I need help",
    messageStored: true,
  }
}

function setInteractionGuild(
  interaction: ChatInputCommandInteraction,
  guild: Guild | null
): void {
  ;(interaction as unknown as { guild: Guild | null }).guild = guild
}

function createGuildWithChannel(
  channel: Record<string, unknown> | null
): Guild {
  const channels = new Map<string, Record<string, unknown>>()

  if (channel) {
    channels.set(targetId, channel)
  }

  return {
    channels: {
      cache: channels,
      async fetch() {
        return channel
      },
    },
  } as unknown as Guild
}

test("DM /help opens a private JCN support ticket", async () => {
  const { interaction, replies } = createInteraction({
    message: "I need help",
  })
  const openedInputs: DiscordSupportTicketOpenInput[] = []

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      throw new Error("DM support must not fetch guild config")
    },
    async openTicket(input) {
      openedInputs.push(input)
      return openedResult("jcn")
    },
  })

  assert.deepEqual(openedInputs, [
    {
      requesterDiscordUserId: userId,
      message: "I need help",
    },
  ])
  assert.deepEqual(replies, [
    {
      flags: MessageFlags.Ephemeral,
      content:
        "Your JCN support request has been opened. JCN staff can review it privately in Cleo.",
    },
  ])
})

test("guild /help requires configured runtime support routing", async () => {
  const { interaction, replies } = createInteraction({ guildId })
  let openCalls = 0

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      return readyConfig({ supportEnabled: false })
    },
    async openTicket() {
      openCalls += 1
      return openedResult("guild")
    },
  })

  assert.equal(openCalls, 0)
  assert.match(
    (replies[0] as { content: string }).content,
    /configure Support in the Cleo dashboard/
  )
})

test("user-installed /help inside a guild routes to JCN support", async () => {
  const { interaction } = createInteraction({ guildId })
  interaction.authorizingIntegrationOwners = {
    1: userId,
  }
  let openedInput: DiscordSupportTicketOpenInput | undefined

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      throw new Error("User-install support must not fetch guild config")
    },
    async openTicket(input) {
      openedInput = input
      return openedResult("jcn")
    },
  })

  assert.equal(openedInput?.discordGuildId, undefined)
  assert.equal(isUserInstallInteraction(interaction), true)
})

test("guild /help opens and notifies configured guild support", async () => {
  const { interaction, replies } = createInteraction({
    guildId,
    message: "Please help",
  })
  let notified = false

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      return readyConfig()
    },
    async openTicket(input) {
      assert.equal(input.discordGuildId, guildId)
      return {
        ...openedResult("guild"),
        submittedMessage: "Please help",
      }
    },
    async notifyGuildSupport(_interaction, result) {
      notified = true
      assert.equal(result.scope, "guild")
      return true
    },
  })

  assert.equal(notified, true)
  assert.match((replies[0] as { content: string }).content, /routed privately/)
})

test("backend support failure replies safely and reports an incident", async () => {
  const { interaction, replies } = createInteraction({})
  const reports: unknown[] = []

  await handleHelpCommand(interaction, {
    async openTicket() {
      return null
    },
    async reportRuntimeError(report) {
      reports.push(report)
      return null
    },
  })

  assert.equal(reports.length, 1)
  assert.match(
    (replies[0] as { content: string }).content,
    /temporarily unavailable/
  )
})

test("thrown backend support failure is reported without leaking the error", async () => {
  const { interaction, replies } = createInteraction({})
  const loggedErrors: unknown[] = []

  await handleHelpCommand(interaction, {
    async openTicket() {
      throw new Error("backend secret")
    },
    logError(message, error, metadata) {
      loggedErrors.push({ message, error, metadata })
    },
    async reportRuntimeError() {
      throw new Error("reporting unavailable")
    },
  })

  assert.equal(loggedErrors.length, 2)
  assert.match(
    (replies[0] as { content: string }).content,
    /temporarily unavailable/
  )
})

test("backend guild-support rejection uses the configured-unavailable reply", async () => {
  const { interaction, replies } = createInteraction({ guildId })

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      return readyConfig()
    },
    async openTicket() {
      return {
        status: "guildSupportUnavailable",
        reason: "disabled",
      }
    },
  })

  assert.match(
    (replies[0] as { content: string }).content,
    /has not configured Cleo support/
  )
})

test("runtime config lookup failure keeps guild support closed", async () => {
  const { interaction, replies } = createInteraction({ guildId })
  const loggedErrors: unknown[] = []

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      throw new Error("config unavailable")
    },
    logError(message, error, metadata) {
      loggedErrors.push({ message, error, metadata })
    },
  })

  assert.equal(loggedErrors.length, 1)
  assert.match(
    (replies[0] as { content: string }).content,
    /has not configured Cleo support/
  )
})

test("guild notification failure keeps the persisted ticket usable", async () => {
  const { interaction, replies } = createInteraction({ guildId })
  const reports: unknown[] = []

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      return readyConfig()
    },
    async openTicket() {
      return openedResult("guild")
    },
    async notifyGuildSupport() {
      throw new Error("Discord send failed")
    },
    logError() {},
    async reportRuntimeError(report) {
      reports.push(report)
      return null
    },
  })

  assert.equal(reports.length, 1)
  assert.match((replies[0] as { content: string }).content, /saved.*dashboard/)
})

test("staff notification allows only configured role mentions", () => {
  const message = formatSupportStaffMessage(
    openedResult("guild") as never,
    userId
  )

  assert.match(message.content ?? "", new RegExp(`<@&${roleId}>`))
  assert.match(message.content ?? "", /I need help/)
  assert.deepEqual(message.allowedMentions, {
    parse: [],
    roles: [roleId],
    users: [],
  })
})

test("resumed staff notification avoids repeat pings and handles no message", () => {
  const result = {
    ...openedResult("guild"),
    status: "resumed" as const,
    route: undefined,
    submittedMessage: undefined,
  }
  const message = formatSupportStaffMessage(result as never, userId)

  assert.doesNotMatch(message.content ?? "", /<@&/)
  assert.match(message.content ?? "", /Updated Cleo support request/)
  assert.match(message.content ?? "", /No message was submitted/)
  assert.deepEqual(message.allowedMentions, {
    parse: [],
    roles: [],
    users: [],
  })
})

test("opened staff notification without a route has no allowed role mentions", () => {
  const message = formatSupportStaffMessage(
    {
      ...openedResult("guild"),
      route: undefined,
    } as never,
    userId
  )

  assert.deepEqual(message.allowedMentions?.roles, [])
})

test("resumed JCN tickets use resumed confirmation copy", async () => {
  const { interaction, replies } = createInteraction({})

  await handleHelpCommand(interaction, {
    async openTicket() {
      return {
        ...openedResult("jcn"),
        status: "resumed",
      }
    },
  })

  assert.match((replies[0] as { content: string }).content, /been resumed/)
})

test("default support dependencies route to a cached guild channel", async () => {
  const originalFetch = convexBotClient.fetchGuildRuntimeConfig
  const originalOpen = convexBotClient.openOrResumeSupportTicket
  const sentMessages: unknown[] = []
  const channel = {
    type: ChannelType.GuildText,
    isTextBased: () => true,
    isSendable: () => true,
    async send(message: unknown) {
      sentMessages.push(message)
    },
  }
  const { interaction, replies } = createInteraction({
    guildId,
    message: "Default route",
  })
  setInteractionGuild(interaction, createGuildWithChannel(channel))

  convexBotClient.fetchGuildRuntimeConfig = async () => readyConfig()
  convexBotClient.openOrResumeSupportTicket = async () => ({
    ...openedResult("guild"),
    submittedMessage: "Default route",
  })
  clearDiscordGuildRuntimeConfigCache()

  try {
    await handleHelpCommand(interaction)
  } finally {
    convexBotClient.fetchGuildRuntimeConfig = originalFetch
    convexBotClient.openOrResumeSupportTicket = originalOpen
    clearDiscordGuildRuntimeConfigCache()
  }

  assert.equal(sentMessages.length, 1)
  assert.match((replies[0] as { content: string }).content, /routed privately/)
})

test("default guild notifier handles unavailable destinations", async () => {
  const cases = [
    {
      name: "missing route",
      result: { ...openedResult("guild"), route: undefined },
      guild: createGuildWithChannel(null),
    },
    {
      name: "missing guild",
      result: openedResult("guild"),
      guild: null,
    },
    {
      name: "unsupported channel",
      result: openedResult("guild"),
      guild: createGuildWithChannel({
        type: ChannelType.GuildText,
        isTextBased: () => false,
        isSendable: () => false,
      }),
    },
    {
      name: "forum route points at a text channel",
      result: {
        ...openedResult("guild"),
        route: {
          targetId,
          targetType: "forum" as const,
          staffRoleIds: [roleId],
        },
      },
      guild: createGuildWithChannel({
        type: ChannelType.GuildText,
      }),
    },
  ]

  for (const item of cases) {
    const { interaction, replies } = createInteraction({ guildId })
    setInteractionGuild(interaction, item.guild)

    await handleHelpCommand(interaction, {
      async fetchConfig() {
        return readyConfig()
      },
      async openTicket() {
        return item.result
      },
      async reportRuntimeError() {
        return null
      },
    })

    assert.match(
      (replies[0] as { content: string }).content,
      /notification could not be delivered/,
      item.name
    )
  }
})

test("default guild notifier creates forum threads with safe names", async () => {
  const createdThreads: unknown[] = []
  const forum = {
    type: ChannelType.GuildForum,
    threads: {
      async create(input: unknown) {
        createdThreads.push(input)
      },
    },
  }
  const { interaction } = createInteraction({ guildId })
  setInteractionGuild(interaction, createGuildWithChannel(forum))
  interaction.user.username = ` \r\n${"x".repeat(100)} `

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      return readyConfig({ supportTargetType: "forum" })
    },
    async openTicket() {
      return {
        ...openedResult("guild"),
        route: {
          targetId,
          targetType: "forum",
          staffRoleIds: [roleId],
        },
      }
    },
  })

  assert.equal(createdThreads.length, 1)
  assert.equal(
    (createdThreads[0] as { name: string }).name,
    `Support · ${"x".repeat(80)}`
  )
})

test("forum thread names fall back when the Discord username is blank", async () => {
  const createdThreads: unknown[] = []
  const { interaction } = createInteraction({ guildId })
  setInteractionGuild(
    interaction,
    createGuildWithChannel({
      type: ChannelType.GuildForum,
      threads: {
        async create(input: unknown) {
          createdThreads.push(input)
        },
      },
    })
  )
  interaction.user.username = "\r\n"

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      return readyConfig({ supportTargetType: "forum" })
    },
    async openTicket() {
      return {
        ...openedResult("guild"),
        route: {
          targetId,
          targetType: "forum",
          staffRoleIds: [roleId],
        },
      }
    },
  })

  assert.equal(
    (createdThreads[0] as { name: string }).name,
    "Support · Discord user"
  )
})

test("uncached guild destination fetch failures are non-fatal", async () => {
  const { interaction, replies } = createInteraction({ guildId })
  setInteractionGuild(interaction, {
    channels: {
      cache: new Map(),
      async fetch() {
        throw new Error("Discord unavailable")
      },
    },
  } as unknown as Guild)

  await handleHelpCommand(interaction, {
    async fetchConfig() {
      return readyConfig()
    },
    async openTicket() {
      return openedResult("guild")
    },
    async reportRuntimeError() {
      return null
    },
  })

  assert.match(
    (replies[0] as { content: string }).content,
    /notification could not be delivered/
  )
})

test("runtime config readiness requires enabled complete routing", () => {
  assert.equal(isGuildSupportReady(readyConfig().config), true)
  assert.equal(
    isGuildSupportReady(readyConfig({ supportTargetId: undefined }).config),
    false
  )
  assert.equal(
    isGuildSupportReady(readyConfig({ supportStaffRoleIds: [] }).config),
    false
  )
})
