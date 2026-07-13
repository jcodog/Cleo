import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js"

import { createCleoCommand } from "./cleo"

const discordGuildId = "123456789012345678"

test("/cleo is a guild-manager command with a status subcommand", () => {
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
      type: ApplicationCommandOptionType.Subcommand,
      name: "status",
      description: "Show the active Cleo services for this server",
    },
  ])
})

test("/cleo rejects non-guild execution before reading configuration", async () => {
  let fetchCount = 0
  const replies: unknown[] = []
  const command = createCleoCommand({
    async fetchRuntimeConfig() {
      fetchCount += 1
      return { status: "disabled", reason: "unknownGuild" }
    },
  })
  const interaction = {
    guildId: null,
    inGuild: () => false,
    async reply(message: unknown) {
      replies.push(message)
    },
  }

  await command.execute({ interaction: interaction as never })

  assert.equal(fetchCount, 0)
  assert.deepEqual(replies, [
    {
      content: "This command can only be used inside a server.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    },
  ])
})

test("/cleo requires Manage Server before reading configuration", async () => {
  let fetchCount = 0
  const replies: unknown[] = []
  const command = createCleoCommand({
    async fetchRuntimeConfig() {
      fetchCount += 1
      return { status: "disabled", reason: "unknownGuild" }
    },
  })
  const interaction = {
    guildId: discordGuildId,
    inGuild: () => true,
    memberPermissions: {
      has: () => false,
    },
    async reply(message: unknown) {
      replies.push(message)
    },
  }

  await command.execute({ interaction: interaction as never })

  assert.equal(fetchCount, 0)
  assert.deepEqual(replies, [
    {
      content:
        "You need the Manage Server permission to inspect Cleo's configuration.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    },
  ])
})

test("/cleo status reads the cached runtime configuration and replies safely", async () => {
  const calls: string[] = []
  const fetchedGuildIds: string[] = []
  const deferred: unknown[] = []
  const edits: unknown[] = []
  const command = createCleoCommand({
    dashboardBaseUrl: "https://dashboard.example.com",
    async fetchRuntimeConfig(requestedGuildId) {
      fetchedGuildIds.push(requestedGuildId)
      return {
        status: "ready",
        config: {
          discordGuildId: requestedGuildId,
          moderationEnabled: true,
          welcomeEnabled: true,
          loggingEnabled: false,
          supportEnabled: true,
        },
      }
    },
  })
  const interaction = {
    guildId: discordGuildId,
    guild: { name: "Cleo HQ" },
    inGuild: () => true,
    memberPermissions: {
      has: (permission: bigint) => permission === PermissionFlagsBits.ManageGuild,
    },
    options: {
      getSubcommand: () => "status",
    },
    async deferReply(message: unknown) {
      calls.push("deferReply")
      deferred.push(message)
    },
    async editReply(message: unknown) {
      calls.push("editReply")
      edits.push(message)
    },
  }

  await command.execute({ interaction: interaction as never })

  assert.deepEqual(fetchedGuildIds, [discordGuildId])
  assert.deepEqual(calls, ["deferReply", "editReply"])
  assert.deepEqual(deferred, [{ flags: MessageFlags.Ephemeral }])
  assert.equal(typeof (edits[0] as { content?: unknown }).content, "string")
  const content = (edits[0] as { content: string }).content
  assert.match(content, /Configuration: \*\*Active\*\*/)
  assert.match(content, /Moderation: Enabled/)
  assert.match(content, /Logging: Disabled/)
  assert.match(
    content,
    /https:\/\/dashboard\.example\.com\/dashboard\/123456789012345678/
  )
  assert.deepEqual((edits[0] as { allowedMentions: unknown }).allowedMentions, {
    parse: [],
  })
})

test("/cleo status converts unexpected backend failures into a safe state", async () => {
  const edits: unknown[] = []
  const command = createCleoCommand({
    async fetchRuntimeConfig() {
      throw new Error("secret=do-not-expose")
    },
  })
  const interaction = {
    guildId: discordGuildId,
    guild: { name: "Cleo HQ" },
    inGuild: () => true,
    memberPermissions: {
      has: () => true,
    },
    options: {
      getSubcommand: () => "status",
    },
    async deferReply() {},
    async editReply(message: unknown) {
      edits.push(message)
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

  const content = (edits[0] as { content: string }).content
  assert.match(content, /Configuration: \*\*Temporarily unavailable\*\*/)
  assert.doesNotMatch(content, /do-not-expose/)
})
