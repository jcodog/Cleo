import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationIntegrationType,
  Events,
  InteractionContextType,
  type ClientEvents,
} from "discord.js"

import { Command } from "./Command"
import { Event } from "./Event"
import { BotClient } from "./Client"
import { loadEvents } from "../loaders/loadEvents"
import type { DiscordRuntimeErrorReportInput } from "@/services/runtimeErrorReporter"

type LoadedClientEvent = {
  [TEventName in keyof ClientEvents]: Event<TEventName>
}[keyof ClientEvents]

type LoadedEventRegistrar = {
  registerLoadedEvent: (event: LoadedClientEvent) => void
}

type LoadedCommandRegistrar = {
  registerLoadedCommands: (commands: readonly Command[]) => void
}

function registerLoadedEvent(
  client: BotClient,
  event: LoadedClientEvent
): void {
  const registrar = client as unknown as LoadedEventRegistrar

  registrar.registerLoadedEvent(event)
}

function registerLoadedCommands(
  client: BotClient,
  commands: readonly Command[]
): void {
  const registrar = client as unknown as LoadedCommandRegistrar

  registrar.registerLoadedCommands(commands)
}

function command(name: string): Command {
  return new Command({
    data: {
      name,
      description: `${name} command`,
      contexts: [InteractionContextType.Guild],
      integration_types: [ApplicationIntegrationType.GuildInstall],
    },
    execute() {
      return undefined
    },
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

test("loaded events attach listeners before they are logged as registered", async () => {
  const client = new BotClient()
  const events = await loadEvents()

  for (const event of events) {
    assert.equal(client.listenerCount(event.name), 0)

    registerLoadedEvent(client, event)

    assert.equal(client.listenerCount(event.name), 1)
  }
})

test("synthetic once event emitted twice executes exactly once", () => {
  const client = new BotClient()
  const messages: string[] = []

  registerLoadedEvent(
    client,
    new Event({
      name: Events.Debug,
      once: true,
      execute(message) {
        messages.push(message)
      },
    })
  )

  client.emit(Events.Debug, "first")
  client.emit(Events.Debug, "second")

  assert.deepEqual(messages, ["first"])
})

test("valid typed normal event emitted twice executes twice", () => {
  const client = new BotClient()
  const messages: string[] = []

  registerLoadedEvent(
    client,
    new Event({
      name: Events.Debug,
      execute(message) {
        messages.push(message)
      },
    })
  )

  client.emit(Events.Debug, "first")
  client.emit(Events.Debug, "second")

  assert.deepEqual(messages, ["first", "second"])
})

test("malformed loaded event definitions fail loudly", () => {
  const client = new BotClient()

  assert.throws(
    () =>
      registerLoadedEvent(client, {
        name: Events.Debug,
        once: false,
      } as unknown as Event<Events.Debug>),
    /Malformed loaded event definition: debug/
  )
})

test("rejected event handlers are logged without unhandled rejections", async (t) => {
  const reporter = createRuntimeErrorCollector()
  const client = new BotClient(undefined, {
    reportRuntimeError: reporter.reportRuntimeError,
  })
  const unhandledRejections: unknown[] = []
  const errorLines: string[] = []
  const unhandledRejectionHandler = (reason: unknown) => {
    unhandledRejections.push(reason)
  }

  t.mock.method(console, "error", (line: string) => {
    errorLines.push(line)
  })
  process.on("unhandledRejection", unhandledRejectionHandler)
  t.after(() => {
    process.off("unhandledRejection", unhandledRejectionHandler)
  })

  registerLoadedEvent(
    client,
    new Event({
      name: Events.Debug,
      async execute() {
        throw new Error("failed with token=secret")
      },
    })
  )

  client.emit(Events.Debug, "message")
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(unhandledRejections, [])
  assert.equal(errorLines.length, 1)
  assert.match(errorLines[0] ?? "", /failed with token=\[redacted\]/)
  assert.match(errorLines[0] ?? "", /"eventName":"debug"/)
  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.serviceArea, "gateway")
  assert.equal(reporter.reports[0]?.eventName, "debug")
  assert.equal(reporter.reports[0]?.operation, "executeEventHandler")
  assert.equal(
    reporter.reports[0]?.fingerprint,
    "gateway:executeEventHandler:debug"
  )
})

test("rejected event handlers include safe event context", async (t) => {
  const reporter = createRuntimeErrorCollector()
  const client = new BotClient(undefined, {
    reportRuntimeError: reporter.reportRuntimeError,
  })
  const errorLines: string[] = []

  t.mock.method(console, "error", (line: string) => {
    errorLines.push(line)
  })

  registerLoadedEvent(
    client,
    new Event({
      name: Events.InteractionCreate,
      async execute() {
        throw new Error("interaction failed")
      },
    }) as LoadedClientEvent
  )

  client.emit(Events.InteractionCreate, {
    id: "999999999999999999",
    guildId: "111111111111111111",
    channelId: "222222222222222222",
    commandName: "ping",
    user: {
      id: "333333333333333333",
    },
  } as never)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(errorLines.length, 1)
  assert.match(errorLines[0] ?? "", /"eventName":"interactionCreate"/)
  assert.match(errorLines[0] ?? "", /"discordGuildId":"111111111111111111"/)
  assert.match(errorLines[0] ?? "", /"discordChannelId":"222222222222222222"/)
  assert.match(errorLines[0] ?? "", /"commandName":"ping"/)
  assert.match(errorLines[0] ?? "", /"subjectId":"999999999999999999"/)
  assert.match(errorLines[0] ?? "", /"interactionId":"999999999999999999"/)
  assert.match(errorLines[0] ?? "", /"discordUserId":"333333333333333333"/)
  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.discordGuildId, "111111111111111111")
  assert.deepEqual(reporter.reports[0]?.metadata, {
    operation: "executeEventHandler",
    interactionId: "999999999999999999",
    discordChannelId: "222222222222222222",
    commandName: "ping",
  })
})

test("event reporter failures are logged and swallowed", async (t) => {
  const client = new BotClient(undefined, {
    async reportRuntimeError() {
      throw new Error("report failed")
    },
  })
  const unhandledRejections: unknown[] = []
  const errorLines: string[] = []
  const unhandledRejectionHandler = (reason: unknown) => {
    unhandledRejections.push(reason)
  }

  t.mock.method(console, "error", (line: string) => {
    errorLines.push(line)
  })
  process.on("unhandledRejection", unhandledRejectionHandler)
  t.after(() => {
    process.off("unhandledRejection", unhandledRejectionHandler)
  })

  registerLoadedEvent(
    client,
    new Event({
      name: Events.Debug,
      async execute() {
        throw new Error("event failed")
      },
    })
  )

  client.emit(Events.Debug, "message")
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(unhandledRejections, [])
  assert.equal(errorLines.length, 2)
  assert.match(errorLines[0] ?? "", /Discord event handler failed: debug/)
  assert.match(
    errorLines[1] ?? "",
    /Discord event runtime error report failed\./
  )
})

test("malformed loaded event definitions without names fail clearly", () => {
  const client = new BotClient()

  assert.throws(
    () =>
      registerLoadedEvent(client, {
        execute() {
          return undefined
        },
      } as unknown as Event<Events.Debug>),
    /Malformed loaded event definition: unknown/
  )
})

test("missing bot token rejects startup", async () => {
  const client = new BotClient()

  await assert.rejects(
    client.start(undefined),
    /Missing environment variable DISCORD_BOT_TOKEN/
  )
})

test("duplicate runtime command names fail before collection population", (t) => {
  t.mock.method(console, "log", () => undefined)

  const client = new BotClient()

  assert.throws(
    () => registerLoadedCommands(client, [command("ping"), command("ping")]),
    /Duplicate runtime command name found: \/ping/
  )
  assert.equal(client.commands.size, 0)
})
