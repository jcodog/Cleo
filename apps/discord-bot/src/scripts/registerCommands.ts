import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
} from "discord.js"

import { discordEnv } from "@workspace/env/discord"

import type {
  CommandData,
  CommandOptions,
} from "@workspace/discord-bot/classes/Command"
import { botLog, botLogError } from "@workspace/discord-bot/utils/botLog"

type CommandModule = {
  default?: unknown
  command?: unknown
}

export type RegisterTarget =
  | {
      type: "guild"
      guildId: string
    }
  | {
      type: "global"
    }

const commandsDirectory = fileURLToPath(
  new URL("../handlers/commands", import.meta.url)
)

const logInfo = (message: string) => botLog(message, "info")
const logSuccess = (message: string) => botLog(message, "success")
const logWarn = (message: string) => botLog(message, "warn")
const logError = (message: string, error: unknown) =>
  botLogError(message, error)

function isCommandOptions(value: unknown): value is CommandOptions {
  if (!value || typeof value !== "object") {
    return false
  }

  const command = value as Partial<CommandOptions>

  return Boolean(command.data) && typeof command.execute === "function"
}

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

async function findCommandFiles(
  directory: string,
  depth = 0,
  maxDepth = 3
): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (depth >= maxDepth) {
        logWarn(
          `Skipping command folder deeper than ${maxDepth} levels: ${entryPath}`
        )
        continue
      }

      const nestedFiles = await findCommandFiles(entryPath, depth + 1, maxDepth)
      files.push(...nestedFiles)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (
      entry.name.endsWith(".d.ts") ||
      (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js"))
    ) {
      continue
    }

    files.push(entryPath)
  }

  return files.sort((a, b) => a.localeCompare(b))
}

async function loadCommandData(): Promise<CommandData[]> {
  const commandFilePaths = await findCommandFiles(commandsDirectory)

  const commandData: CommandData[] = []
  const commandNames = new Set<string>()

  for (const filePath of commandFilePaths) {
    const moduleUrl = pathToFileURL(filePath).href
    const importedModule = (await import(moduleUrl)) as CommandModule

    const command = importedModule.default ?? importedModule.command

    const relativeFilePath = path.relative(commandsDirectory, filePath)

    if (!isCommandOptions(command)) {
      logWarn(
        `Skipping ${relativeFilePath}, missing command data or execute handler.`
      )
      continue
    }

    if (commandNames.has(command.data.name)) {
      throw new Error(`Duplicate command name found: /${command.data.name}`)
    }

    commandNames.add(command.data.name)
    commandData.push(command.data)

    logInfo(`Loaded /${command.data.name} from ${relativeFilePath}`)
  }

  return commandData
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
