import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
} from "discord.js"

import { discordEnv } from "@workspace/env/discord"

import { Command, type CommandData } from "@/classes/Command"
import { loadCommands } from "@/loaders/loadCommands"
import { botLog, botLogError } from "@/utils/botLog"

export type RegisterTarget =
  | {
      type: "guild"
      guildId: string
    }
  | {
      type: "global"
    }

type CommandRegistrationRest = {
  put: (
    route: `/${string}`,
    options: {
      body: CommandData[]
    }
  ) => Promise<unknown> | unknown
}

type RegisterCommandsOptions = {
  args?: readonly string[]
  testGuildId?: string
  token?: string
  applicationId?: string
  rest?: CommandRegistrationRest
  commands?: readonly Command[]
  cleanupGlobalCommandsAfterGuildRegistration?: boolean
}

const logInfo = (message: string) => botLog(message, "info")
const logSuccess = (message: string) => botLog(message, "success")
const logError = (message: string, error: unknown) =>
  botLogError(message, error)

function readArgValue(
  args: readonly string[],
  flag: string
): string | undefined {
  const exactArg = args.find((arg) => arg.startsWith(`${flag}=`))

  if (exactArg) {
    return exactArg.slice(flag.length + 1)
  }

  const flagIndex = args.indexOf(flag)

  if (flagIndex === -1) {
    return undefined
  }

  return args[flagIndex + 1]
}

export function resolveRegisterTarget(
  args: readonly string[] = process.argv,
  testGuildId: string | undefined = discordEnv.DISCORD_TEST_GUILD_ID
): RegisterTarget {
  const wantsGlobal = args.includes("--global")
  const wantsGuild =
    args.includes("--guild") || args.some((arg) => arg.startsWith("--guild="))

  if (wantsGlobal && wantsGuild) {
    throw new Error("Use either --global or --guild, not both.")
  }

  if (wantsGlobal) {
    return {
      type: "global",
    }
  }

  if (wantsGuild) {
    const guildId = readArgValue(args, "--guild") ?? testGuildId

    if (!guildId) {
      throw new Error(
        "Missing guild ID. Pass --guild=<guild_id> or set DISCORD_TEST_GUILD_ID."
      )
    }

    return {
      type: "guild",
      guildId,
    }
  }

  throw new Error(
    "Missing registration target. Use --guild for dev or --global for production"
  )
}

export function prepareCommandsForTarget(
  commands: readonly Command[],
  target: RegisterTarget
): CommandData[] {
  if (target.type === "global") {
    return commands.map((command) => command.data)
  }

  const guildCommandData: CommandData[] = []

  for (const command of commands) {
    const commandData = command.data
    const supportsGuild =
      commandData.contexts?.includes(InteractionContextType.Guild) ?? true

    if (!supportsGuild) {
      logInfo(
        `Skipping /${commandData.name} for guild registration because it does not support guild interactions.`
      )

      continue
    }

    const guildCommand = {
      ...commandData,
    }

    delete guildCommand.contexts
    delete guildCommand.integration_types

    guildCommandData.push(guildCommand)
  }

  return guildCommandData
}

async function putCommandData(
  rest: CommandRegistrationRest,
  route: string,
  commandData: CommandData[]
) {
  return rest.put(route as `/${string}`, {
    body: commandData,
  })
}

async function overwriteCommandScope(
  rest: CommandRegistrationRest,
  route: string,
  scopeLabel: string,
  commandData: CommandData[]
) {
  logInfo(`Registering ${commandData.length} command(s) to ${scopeLabel}...`)

  const response = await putCommandData(rest, route, commandData)

  const registeredCount = Array.isArray(response)
    ? response.length
    : commandData.length

  logSuccess(`Registered ${registeredCount} command(s) to ${scopeLabel}.`)
}

export function validateCommands(commands: readonly Command[]): void {
  const commandNames = new Set<string>()

  for (const command of commands) {
    if (!(command instanceof Command)) {
      throw new Error(
        "Command registry contains an entry that is not a Command instance."
      )
    }

    if (typeof command.execute !== "function") {
      throw new Error(`Command /${command.data.name} does not define execute().`)
    }

    const commandData = command.data

    if (commandNames.has(commandData.name)) {
      throw new Error(`Duplicate command name found: /${commandData.name}`)
    }

    commandNames.add(commandData.name)

    if (!commandData.contexts?.length) {
      throw new Error(
        `Command /${commandData.name} does not declare any interaction contexts.`
      )
    }

    if (!commandData.integration_types?.length) {
      throw new Error(
        `Command /${commandData.name} does not declare any installation types.`
      )
    }

    const supportsPrivateChannels = commandData.contexts.includes(
      InteractionContextType.PrivateChannel
    )

    const supportsUserInstall = commandData.integration_types.includes(
      ApplicationIntegrationType.UserInstall
    )

    if (supportsPrivateChannels && !supportsUserInstall) {
      throw new Error(
        `Command /${commandData.name} supports private channels but does not support user installation.`
      )
    }
  }
}

export async function registerCommands(options: RegisterCommandsOptions = {}) {
  const token = options.token ?? discordEnv.DISCORD_BOT_TOKEN
  const applicationId =
    options.applicationId ?? discordEnv.DISCORD_APPLICATION_ID

  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN.")
  }

  if (!applicationId) {
    throw new Error("Missing DISCORD_APPLICATION_ID.")
  }

  const target = resolveRegisterTarget(options.args, options.testGuildId)

  // Load and validate Command instances first, so a malformed registry cannot
  // wipe Discord's command surface during an overwrite.
  const commands = options.commands ?? (await loadCommands())
  validateCommands(commands)
  const commandData = prepareCommandsForTarget(commands, target)

  if (commandData.length === 0) {
    throw new Error(
      `No commands support the selected ${target.type} registration target.`
    )
  }

  const rest = options.rest ?? new REST({ version: "10" }).setToken(token)

  const globalRoute = Routes.applicationCommands(applicationId)

  const targetRoute =
    target.type === "guild"
      ? Routes.applicationGuildCommands(applicationId, target.guildId)
      : globalRoute

  const targetLabel =
    target.type === "guild"
      ? `guild ${target.guildId}`
      : "global application commands"

  await overwriteCommandScope(rest, targetRoute, targetLabel, commandData)

  if (
    target.type === "guild" &&
    options.cleanupGlobalCommandsAfterGuildRegistration === true
  ) {
    // Guild commands are installed first. If cleanup fails, stale global commands
    // remain temporarily instead of deleting the working command surface first.
    await overwriteCommandScope(
      rest,
      globalRoute,
      "global application commands",
      []
    )
  }
}

function isDirectEntrypoint(): boolean {
  const entrypoint = process.argv[1]

  if (!entrypoint) {
    return false
  }

  return pathToFileURL(path.resolve(entrypoint)).href === import.meta.url
}

if (isDirectEntrypoint()) {
  try {
    await registerCommands()
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error)

    logError("Failed to register Discord slash commands.", message)

    process.exitCode = 1
  }
}
