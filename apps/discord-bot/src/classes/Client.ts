import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  type ClientEvents,
  type ClientOptions,
} from "discord.js"

import type { Command } from "./Command"
import { Event } from "./Event"
import { loadCommands } from "../loaders/loadCommands"
import { loadEvents } from "../loaders/loadEvents"
import {
  reportDiscordRuntimeError,
  type DiscordRuntimeErrorReporter,
} from "@/services/runtimeErrorReporter"
import { botLog, botLogError } from "@/utils/botLog"
import type { LogMetadata } from "@workspace/logger"

type LoadedClientEvent = {
  [TEventName in keyof ClientEvents]: Event<TEventName>
}[keyof ClientEvents]

const defaultClientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.GuildMember, Partials.User],
} satisfies ClientOptions

type BotClientRuntimeOptions = {
  reportRuntimeError?: DiscordRuntimeErrorReporter
}

export class BotClient extends Client {
  public readonly commands = new Collection<string, Command>()
  public readonly reportRuntimeError: DiscordRuntimeErrorReporter

  public constructor(
    options: ClientOptions = defaultClientOptions,
    runtimeOptions: BotClientRuntimeOptions = {}
  ) {
    super(options)
    this.reportRuntimeError =
      runtimeOptions.reportRuntimeError ?? reportDiscordRuntimeError
  }

  public async start(token: string | undefined): Promise<void> {
    if (!token) {
      throw new Error("Missing environment variable DISCORD_BOT_TOKEN")
    }

    botLog("Starting Cleo Discord bot runtime...", "info")
    await this.registerHandlers()

    botLog("Logging in to Discord...", "info")
    await this.login(token)
  }

  private async registerHandlers(): Promise<void> {
    await this.registerCommands()
    await this.registerEvents()
  }

  private async registerCommands(): Promise<void> {
    const commands = await loadCommands()

    this.registerLoadedCommands(commands)

    botLog(`Registered ${commands.length} command handler(s).`, "info")
  }

  private registerLoadedCommands(commands: readonly Command[]): void {
    const commandNames = new Set<string>()

    for (const command of commands) {
      const commandName = command.data.name

      if (commandNames.has(commandName)) {
        throw new Error(`Duplicate runtime command name found: /${commandName}`)
      }

      commandNames.add(commandName)
    }

    for (const command of commands) {
      this.commands.set(command.data.name, command)
      botLog(`Loaded command: /${command.data.name}`, "success")
    }
  }

  private async registerEvents(): Promise<void> {
    const events = await loadEvents()

    for (const event of events) {
      this.registerLoadedEvent(event)

      const mode = event.once ? "once" : "on"
      botLog(`Loaded event: ${String(event.name)} (${mode})`, "success")
    }

    botLog(`Registered ${events.length} event handler(s).`, "info")
  }

  private registerLoadedEvent(event: LoadedClientEvent): void {
    assertLoadedEvent(event)
    const execute = event.execute as (
      ...args: unknown[]
    ) => Promise<void> | void
    const listener = (...args: unknown[]) => {
      void executeLoadedEvent(
        event.name,
        execute,
        args,
        this.reportRuntimeError
      )
    }

    if (event.once) {
      this.once(event.name, listener)
      return
    }

    this.on(event.name, listener)
  }
}

async function executeLoadedEvent(
  eventName: keyof ClientEvents,
  execute: (...args: unknown[]) => Promise<void> | void,
  args: unknown[],
  reportRuntimeError: DiscordRuntimeErrorReporter
): Promise<void> {
  try {
    await execute(...args)
  } catch (error) {
    const context = getSafeEventContext(eventName, args)

    botLogError(
      `Discord event handler failed: ${String(eventName)}`,
      error,
      context
    )

    await reportGatewayEventFailure({
      eventName,
      error,
      context,
      reportRuntimeError,
    })
  }
}

async function reportGatewayEventFailure({
  eventName,
  error,
  context,
  reportRuntimeError,
}: {
  eventName: keyof ClientEvents
  error: unknown
  context: LogMetadata
  reportRuntimeError: DiscordRuntimeErrorReporter
}): Promise<void> {
  const operation = "executeEventHandler"
  const eventNameText = String(eventName)

  try {
    await reportRuntimeError({
      severity: "error",
      serviceArea: "gateway",
      message: `Discord event handler failed: ${eventNameText}`,
      error,
      discordGuildId: getMetadataString(context, "discordGuildId"),
      eventName: eventNameText,
      operation,
      fingerprint: `gateway:${operation}:${eventNameText}`,
      metadata: {
        operation,
        interactionId: getMetadataString(context, "interactionId"),
        discordChannelId: getMetadataString(context, "discordChannelId"),
        commandName: getMetadataString(context, "commandName"),
      },
    })
  } catch (reportError) {
    botLogError("Discord event runtime error report failed.", reportError, {
      eventName: eventNameText,
      operation,
      discordGuildId: getMetadataString(context, "discordGuildId"),
      interactionId: getMetadataString(context, "interactionId"),
    })
  }
}

function assertLoadedEvent(event: LoadedClientEvent): void {
  if (!(event instanceof Event) || typeof event.execute !== "function") {
    throw new Error(
      `Malformed loaded event definition: ${formatEventNameForError(event)}`
    )
  }
}

function formatEventNameForError(event: unknown): string {
  if (
    event &&
    typeof event === "object" &&
    "name" in event &&
    (typeof event.name === "string" || typeof event.name === "symbol")
  ) {
    return String(event.name)
  }

  return "unknown"
}

function getSafeEventContext(
  eventName: keyof ClientEvents,
  args: unknown[]
): LogMetadata {
  const [firstArg] = args
  const context: LogMetadata = {
    eventName: String(eventName),
  }

  if (!firstArg || typeof firstArg !== "object") {
    return context
  }

  if ("guildId" in firstArg && typeof firstArg.guildId === "string") {
    context.discordGuildId = firstArg.guildId
  }

  if (
    "channelId" in firstArg &&
    typeof firstArg.channelId === "string"
  ) {
    context.discordChannelId = firstArg.channelId
  }

  if (
    "commandName" in firstArg &&
    typeof firstArg.commandName === "string"
  ) {
    context.commandName = firstArg.commandName
  }

  if ("id" in firstArg && typeof firstArg.id === "string") {
    context.subjectId = firstArg.id

    if (
      "guildId" in firstArg ||
      "commandName" in firstArg ||
      "isChatInputCommand" in firstArg
    ) {
      context.interactionId = firstArg.id
    }
  }

  if (
    "user" in firstArg &&
    firstArg.user &&
    typeof firstArg.user === "object" &&
    "id" in firstArg.user &&
    typeof firstArg.user.id === "string"
  ) {
    context.discordUserId = firstArg.user.id
  }

  return context
}

function getMetadataString(
  metadata: LogMetadata,
  key: string
): string | undefined {
  const value = metadata[key]

  return typeof value === "string" ? value : undefined
}
