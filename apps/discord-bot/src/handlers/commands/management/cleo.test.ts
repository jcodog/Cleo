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
      description: "Check Cleo's configured services for this server",
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

test("/cleo rejects unavailable subcommands before reading configuration", async () => {
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
      has: () => true,
    },
    options: {
      getSubcommand: () => "removed-command",
    },
    async reply(message: unknown) {
      replies.push(message)
    },
  }

  await command.execute({ interaction: interaction as never })

  assert.equal(fetchCount, 0)
  assert.deepEqual(replies, [
    {
      content: "That Cleo command is not available.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    },
  ])
})

test("/cleo status reads runtime config and returns actionable module state", async () => {
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
          supportTargetId: "223456789012345678",
          supportTargetType: "forum",
          supportStaffRoleIds: [],
        },
      }
    },
  })
  const interaction = {
    guildId: discordGuildId,
    guild: { name: "Cleo *HQ*" },
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

  const edit = edits[0] as {
    content: string
    components: Array<{ toJSON(): unknown }>
    allowedMentions: unknown
  }

  assert.match(edit.content, /Cleo status · Cleo \\\*HQ\\\*/)
  assert.match(edit.content, /✅ \*\*Moderation\*\* · On/)
  assert.match(edit.content, /⚠️ \*\*Welcome\*\* · On, setup incomplete/)
  assert.match(edit.content, /◻️ \*\*Logging\*\* · Off/)
  assert.match(edit.content, /⚠️ \*\*Support\*\* · On, setup incomplete/)
  assert.deepEqual(edit.allowedMentions, { parse: [] })
  assert.deepEqual(edit.components[0]?.toJSON(), {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        label: "Open Cleo dashboard",
        url: `https://dashboard.example.com/dashboard/${discordGuildId}`,
      },
    ],
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

  assert.match(content, /temporarily unavailable/)
  assert.doesNotMatch(content, /do-not-expose|secret=/)
})
