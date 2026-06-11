import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
} from "discord.js"

import { discordEnv } from "@workspace/env/discord"

import type { CommandData } from "@workspace/discord-bot/classes/Command"
import { loadCommands } from "@workspace/discord-bot/loaders/loadCommands"
import { botLog, botLogError } from "@workspace/discord-bot/utils/botLog"

export type RegisterTarget =
  | {
      type: "guild"
      guildId: string
    }
  | {
      type: "global"
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

export async function loadCommandData(): Promise<CommandData[]> {
  const commands = await loadCommands()

  return commands.map((command) => command.data)
}

export function prepareCommandDataForTarget(
  commandData: CommandData[],
  target: RegisterTarget
): CommandData[] {
  if (target.type === "global") {
    return commandData
  }

  const guildCommandData: CommandData[] = []

  for (const command of commandData) {
    const supportsGuild =
      command.contexts?.includes(InteractionContextType.Guild) ?? true

    if (!supportsGuild) {
      logInfo(
        `Skipping /${command.name} for guild registration because it does not support guild interactions.`
      )

      continue
    }

    const guildCommand = {
      ...command,
    }

    delete guildCommand.contexts
    delete guildCommand.integration_types

    guildCommandData.push(guildCommand)
  }

  return guildCommandData
}

async function putCommandData(
  rest: REST,
  route: string,
  commandData: CommandData[]
) {
  return rest.put(route as `/${string}`, {
    body: commandData,
  })
}

async function clearCommandScope(
  rest: REST,
  route: string,
  scopeLabel: string
) {
  logInfo(`Clearing existing commands from ${scopeLabel}...`)

  await putCommandData(rest, route, [])

  logSuccess(`Cleared existing commands from ${scopeLabel}.`)
}

export function validateCommandData(commandData: CommandData[]) {
  const commandNames = new Set<string>()

  for (const command of commandData) {
    if (commandNames.has(command.name)) {
      throw new Error(`Duplicate command name found: /${command.name}`)
    }

    commandNames.add(command.name)

    if (!command.contexts?.length) {
      throw new Error(
        `Command /${command.name} does not declare any interaction contexts.`
      )
    }

    if (!command.integration_types?.length) {
      throw new Error(
        `Command /${command.name} does not declare any installation types.`
      )
    }

    const supportsPrivateChannels = command.contexts.includes(
      InteractionContextType.PrivateChannel
    )

    const supportsUserInstall = command.integration_types.includes(
      ApplicationIntegrationType.UserInstall
    )

    if (supportsPrivateChannels && !supportsUserInstall) {
      throw new Error(
        `Command /${command.name} supports private channels but does not support user installation.`
      )
    }
  }
}

export async function registerCommands() {
  const token = discordEnv.DISCORD_BOT_TOKEN
  const applicationId = discordEnv.DISCORD_APPLICATION_ID

  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN.")
  }

  if (!applicationId) {
    throw new Error("Missing DISCORD_APPLICATION_ID.")
  }

  const target = resolveRegisterTarget()

  // Load and validate first, so we do not wipe Discord commands if local files are broken.
  const loadedCommandData = await loadCommandData()
  validateCommandData(loadedCommandData)
  const commandData = prepareCommandDataForTarget(loadedCommandData, target)

  if (commandData.length === 0) {
    throw new Error(
      `No commands support the selected ${target.type} registration target.`
    )
  }

  const rest = new REST({ version: "10" }).setToken(token)

  const globalRoute = Routes.applicationCommands(applicationId)

  const targetRoute =
    target.type === "guild"
      ? Routes.applicationGuildCommands(applicationId, target.guildId)
      : globalRoute

  const targetLabel =
    target.type === "guild"
      ? `guild ${target.guildId}`
      : "global application commands"

  // Always clear global commands first.
  // This prevents old global commands from hanging around during guild-only dev registration.
  await clearCommandScope(rest, globalRoute, "global application commands")

  // If registering to a guild, also clear that guild's local command scope.
  if (target.type === "guild") {
    await clearCommandScope(rest, targetRoute, targetLabel)
  }

  logInfo(`Registering ${commandData.length} command(s) to ${targetLabel}...`)

  const response = await putCommandData(rest, targetRoute, commandData)

  const registeredCount = Array.isArray(response)
    ? response.length
    : commandData.length

  logSuccess(`Registered ${registeredCount} command(s) to ${targetLabel}.`)
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
