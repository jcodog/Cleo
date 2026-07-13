import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js"

import { createCleoCommand } from "./cleo"

const GUILD_ID = "123456789012345678"

test("/cleo is a guild-manager command with an extensible status subcommand", () => {
  const command = createCleoCommand()

  assert.equal(command.data.name, "cleo")
  assert.equal(
    command.data.default_member_permissions,
    PermissionFlagsBits.ManageGuild.toString()
  )
  assert.deepEqual(command.data.integration_types, [
    ApplicationIntegrationType.GuildInstall,
  ])
  assert.deepEqual(command.data.contexts, [InteractionContextType.Guild])
  assert.deepEqual(command.data.options, [
    {
      name: "status",
      description: "Check Cleo's configured services for this server",
      type: ApplicationCommandOptionType.Subcommand,
    },
  ])
})

test("/cleo status replies privately with live config and a dashboard action", async () => {
  const requestedGuildIds: string[] = []
  const replies: unknown[] = []
  const command = createCleoCommand({
    dashboardBaseUrl: "https://dashboard.example.com",
    async fetchRuntimeConfig(discordGuildId) {
      requestedGuildIds.push(discordGuildId)
      return {
        status: "ready",
        config: {
          discordGuildId,
          moderationEnabled: true,
          welcomeEnabled: false,
          loggingEnabled: false,
          supportEnabled: false,
        },
      }
    },
  })
  const interaction = {
    guildId: GUILD_ID,
    async reply(message: unknown) {
      replies.push(message)
    },
  }

  await command.execute({ interaction: interaction as never })

  assert.deepEqual(requestedGuildIds, [GUILD_ID])
  assert.equal(replies.length, 1)

  const reply = replies[0] as {
    content: string
    flags: MessageFlags
    components: Array<{ toJSON(): unknown }>
  }

  assert.match(reply.content, /Cleo server status/)
  assert.match(reply.content, /✅ \*\*Moderation\*\* · On/)
  assert.match(reply.content, /◻️ \*\*Welcome\*\* · Off/)
  assert.equal(reply.flags, MessageFlags.Ephemeral)
  assert.deepEqual(reply.components[0]?.toJSON(), {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        label: "Open Cleo dashboard",
        url: `https://dashboard.example.com/dashboard/${GUILD_ID}`,
      },
    ],
  })
})

test("/cleo status returns a safe temporary failure state when config loading throws", async () => {
  const replies: unknown[] = []
  const command = createCleoCommand({
    async fetchRuntimeConfig() {
      throw new Error("backend token=do-not-expose")
    },
  })
  const interaction = {
    guildId: GUILD_ID,
    async reply(message: unknown) {
      replies.push(message)
    },
  }
  const originalConsoleError = console.error

  console.error = () => undefined

  try {
    await assert.doesNotReject(async () => {
      await command.execute({ interaction: interaction as never })
    })
  } finally {
    console.error = originalConsoleError
  }

  const reply = replies[0] as { content: string }

  assert.match(reply.content, /temporarily unavailable/)
  assert.doesNotMatch(reply.content, /token|do-not-expose/)
})

test("/cleo status rejects non-guild execution without fetching config", async () => {
  let fetchCalls = 0
  const replies: unknown[] = []
  const command = createCleoCommand({
    async fetchRuntimeConfig() {
      fetchCalls += 1
      return { status: "disabled", reason: "missingConfig" }
    },
  })
  const interaction = {
    guildId: null,
    async reply(message: unknown) {
      replies.push(message)
    },
  }

  await command.execute({ interaction: interaction as never })

  assert.equal(fetchCalls, 0)
  assert.deepEqual(replies, [
    {
      content: "This command can only be used inside a Discord server.",
      flags: MessageFlags.Ephemeral,
    },
  ])
})
