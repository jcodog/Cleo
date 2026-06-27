import assert from "node:assert/strict"
import { test } from "node:test"

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js"

import type {
  DiscordSupportTicketOpenInput,
  DiscordSupportTicketOpenResult,
} from "./convexBotClient"
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

function openedResult(scope: "jcn" | "guild"): DiscordSupportTicketOpenResult {
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
