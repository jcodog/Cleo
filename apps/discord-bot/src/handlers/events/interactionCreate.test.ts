import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
} from "discord.js"

import { BotClient } from "@/classes/Client"
import { Command } from "@/classes/Command"
import type { DiscordRuntimeErrorReportInput } from "@/services/runtimeErrorReporter"

import interactionCreate from "./interactionCreate"

type InteractionReply = {
  content: string
  flags?: number
}

type ChatInteractionDouble = {
  id: string
  commandName: string
  client: BotClient
  guildId: string
  channelId: string
  user: {
    id: string
  }
  replied: boolean
  deferred: boolean
  isChatInputCommand: () => boolean
  reply: (message: InteractionReply) => Promise<void>
  editReply: (message: InteractionReply) => Promise<void>
}

function createInteraction(
  overrides: Partial<ChatInteractionDouble> = {}
): ChatInteractionDouble {
  return {
    id: "111111111111111111",
    commandName: "ping",
    client: new BotClient(),
    guildId: "222222222222222222",
    channelId: "333333333333333333",
    user: {
      id: "444444444444444444",
    },
    replied: false,
    deferred: false,
    isChatInputCommand: () => true,
    async reply() {
      return undefined
    },
    async editReply() {
      return undefined
    },
    ...overrides,
  }
}

function command(
  execute: Command["execute"] = () => undefined
): Command {
  return new Command({
    data: {
      name: "ping",
      description: "Ping command",
      contexts: [InteractionContextType.Guild],
      integration_types: [ApplicationIntegrationType.GuildInstall],
    },
    execute,
  })
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

test("interactionCreate ignores non-chat-input interactions", async () => {
  let replied = false
  const interaction = createInteraction({
    isChatInputCommand: () => false,
    async reply() {
      replied = true
    },
  })

  await interactionCreate.execute(interaction as never)

  assert.equal(replied, false)
})

test("interactionCreate handles unknown command names safely", async () => {
  const reporter = createRuntimeErrorCollector()
  const replies: InteractionReply[] = []
  const client = new BotClient(undefined, {
    reportRuntimeError: reporter.reportRuntimeError,
  })
  const interaction = createInteraction({
    client,
    commandName: "missing",
    async reply(message) {
      replies.push(message)
    },
  })

  await interactionCreate.execute(interaction as never)

  assert.equal(replies.length, 1)
  assert.equal(replies[0]?.content, "That command is not currently available.")
  assert.equal(reporter.reports.length, 0)
})

test("interactionCreate executes a known successful command", async () => {
  const client = new BotClient()
  const executedCommands: string[] = []
  const interaction = createInteraction({ client })

  client.commands.set(
    "ping",
    command(({ interaction }) => {
      executedCommands.push(interaction.commandName)
    })
  )

  await interactionCreate.execute(interaction as never)

  assert.deepEqual(executedCommands, ["ping"])
})

test("interactionCreate routes command failures through the reply helper", async (t) => {
  t.mock.method(console, "log", () => undefined)
  t.mock.method(console, "error", () => undefined)

  const reporter = createRuntimeErrorCollector()
  const client = new BotClient(undefined, {
    reportRuntimeError: reporter.reportRuntimeError,
  })
  const replies: InteractionReply[] = []
  const interaction = createInteraction({
    client,
    async reply(message) {
      replies.push(message)
    },
  })

  client.commands.set(
    "ping",
    command(() => {
      throw new Error("command failed")
    })
  )

  await interactionCreate.execute(interaction as never)

  assert.deepEqual(replies, [
    {
      content: "Something went wrong while running that command.",
      flags: MessageFlags.Ephemeral,
    },
  ])
  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.serviceArea, "command")
  assert.equal(reporter.reports[0]?.commandName, "ping")
  assert.equal(reporter.reports[0]?.discordGuildId, "222222222222222222")
  assert.equal(reporter.reports[0]?.operation, "executeSlashCommand")
  assert.equal(
    reporter.reports[0]?.fingerprint,
    "command:executeSlashCommand:ping"
  )
  assert.deepEqual(reporter.reports[0]?.metadata, {
    operation: "executeSlashCommand",
    interactionId: "111111111111111111",
    discordChannelId: "333333333333333333",
  })
})

test("interactionCreate edits deferred interactions on command failure", async (t) => {
  t.mock.method(console, "log", () => undefined)
  t.mock.method(console, "error", () => undefined)

  const reporter = createRuntimeErrorCollector()
  const client = new BotClient(undefined, {
    reportRuntimeError: reporter.reportRuntimeError,
  })
  const replies: InteractionReply[] = []
  const interaction = createInteraction({
    client,
    deferred: true,
    async editReply(message) {
      replies.push(message)
    },
  })

  client.commands.set(
    "ping",
    command(() => {
      throw new Error("command failed")
    })
  )

  await interactionCreate.execute(interaction as never)

  assert.deepEqual(replies, [
    {
      content: "Something went wrong while running that command.",
    },
  ])
  assert.equal(reporter.reports.length, 1)
})

test("reply-helper failure does not create an unhandled rejection", async (t) => {
  const reporter = createRuntimeErrorCollector()
  const client = new BotClient(undefined, {
    reportRuntimeError: reporter.reportRuntimeError,
  })
  const unhandledRejections: unknown[] = []
  const unhandledRejectionHandler = (reason: unknown) => {
    unhandledRejections.push(reason)
  }
  const interaction = createInteraction({
    client,
    async reply() {
      throw new Error("reply failed")
    },
  })

  t.mock.method(console, "log", () => undefined)
  t.mock.method(console, "error", () => undefined)
  process.on("unhandledRejection", unhandledRejectionHandler)
  t.after(() => {
    process.off("unhandledRejection", unhandledRejectionHandler)
  })

  client.commands.set(
    "ping",
    command(() => {
      throw new Error("command failed")
    })
  )

  await assert.doesNotReject(async () => {
    await interactionCreate.execute(interaction as never)
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(unhandledRejections, [])
  assert.equal(reporter.reports.length, 1)
})

test("interaction command failure logging uses safe context", async (t) => {
  const reporter = createRuntimeErrorCollector()
  const client = new BotClient(undefined, {
    reportRuntimeError: reporter.reportRuntimeError,
  })
  const logLines: string[] = []
  const interaction = createInteraction({ client })

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })
  t.mock.method(console, "error", () => undefined)

  client.commands.set(
    "ping",
    command(() => {
      throw new Error("failed with token=secret")
    })
  )

  await interactionCreate.execute(interaction as never)

  assert.equal(logLines.length, 1)
  assert.match(logLines[0] ?? "", /failed with token=\[redacted\]/)
  assert.match(logLines[0] ?? "", /"commandName":"ping"/)
  assert.match(logLines[0] ?? "", /"interactionId":"111111111111111111"/)
  assert.match(logLines[0] ?? "", /"discordGuildId":"222222222222222222"/)
  assert.match(logLines[0] ?? "", /"discordChannelId":"333333333333333333"/)
  assert.match(logLines[0] ?? "", /"discordUserId":"444444444444444444"/)
  assert.equal(reporter.reports.length, 1)
})

test("command reporter failures are logged and swallowed", async (t) => {
  const client = new BotClient(undefined, {
    async reportRuntimeError() {
      throw new Error("report failed")
    },
  })
  const replies: InteractionReply[] = []
  const logLines: string[] = []
  const interaction = createInteraction({
    client,
    async reply(message) {
      replies.push(message)
    },
  })

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })
  t.mock.method(console, "error", () => undefined)

  client.commands.set(
    "ping",
    command(() => {
      throw new Error("command failed")
    })
  )

  await assert.doesNotReject(async () => {
    await interactionCreate.execute(interaction as never)
  })

  assert.deepEqual(replies, [
    {
      content: "Something went wrong while running that command.",
      flags: MessageFlags.Ephemeral,
    },
  ])
  assert.equal(logLines.length, 2)
  assert.match(logLines[0] ?? "", /Command failed: \/ping/)
  assert.match(
    logLines[1] ?? "",
    /Discord command runtime error report failed\./
  )
})
