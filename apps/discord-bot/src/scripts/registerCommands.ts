import { isDeepStrictEqual } from "node:util"

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

export const commandVerificationVersion = 1

export async function getGlobalCommandDefinitions(): Promise<CommandData[]> {
  const commands = await loadCommands()
  validateCommands(commands)
  return prepareCommandsForTarget(commands, { type: "global" })
}

export type RegisterTarget =
  | {
      type: "guild"
      guildId: string
    }
  | {
      type: "global"
    }

type CommandRegistrationRest = {
  get: (
    route: `/${string}`,
    options?: { query: URLSearchParams }
  ) => Promise<unknown> | unknown
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
  route: `/${string}`,
  scopeLabel: string,
  commandData: CommandData[]
) {
  logInfo(
    `Deploying ${commandData.length} command(s) to ${scopeLabel}: ${commandData.map((command) => `/${command.name}`).join(", ")}`
  )

  await putCommandData(rest, route, commandData)
  const liveCommands = await rest.get(route, {
    query: new URLSearchParams({ with_localizations: "true" }),
  })
  verifyCommandDefinitions(commandData, liveCommands)
  logSuccess(
    `Verified ${commandData.length} command(s) on Discord for ${scopeLabel}.`
  )
}

function commandObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "Discord command verification received an invalid definition."
    )
  }
  return Object.fromEntries(Object.entries(value))
}

function definitionList(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new Error("Discord command verification received an invalid list.")
  }
  return value
}

function localizations(value: unknown, defaultValue: unknown) {
  if (value === undefined || value === null) return {}
  return Object.fromEntries(
    Object.entries(commandObject(value)).filter(
      ([, text]) => text !== defaultValue
    )
  )
}

function normalizedDefinition(
  value: unknown,
  kind: "command" | "option" | "choice"
): Record<string, unknown> {
  const data = commandObject(value)
  const result: Record<string, unknown> = {
    name: data.name,
    name_localizations: localizations(data.name_localizations, data.name),
  }
  if (kind === "choice") return { ...result, value: data.value }
  result.description = data.description
  result.description_localizations = localizations(
    data.description_localizations,
    data.description
  )
  result.type = data.type ?? (kind === "command" ? 1 : undefined)
  result.options = definitionList(data.options).map((option) =>
    normalizedDefinition(option, "option")
  )
  if (kind === "command") {
    result.default_member_permissions = data.default_member_permissions ?? null
    result.default_permission = data.default_permission ?? true
    result.dm_permission = data.dm_permission ?? true
    result.nsfw = data.nsfw ?? false
    for (const field of ["contexts", "integration_types"]) {
      result[field] = [...definitionList(data[field])].sort()
    }
  } else {
    result.required = data.required ?? false
    result.autocomplete = data.autocomplete ?? false
    result.choices = definitionList(data.choices).map((choice) =>
      normalizedDefinition(choice, "choice")
    )
    result.channel_types = [...definitionList(data.channel_types)].sort()
    for (const field of [
      "min_value",
      "max_value",
      "min_length",
      "max_length",
    ]) {
      result[field] = data[field] ?? null
    }
  }
  return result
}

export function verifyCommandDefinitions(
  intended: readonly CommandData[],
  response: unknown
): void {
  if (!Array.isArray(response)) {
    throw new Error(
      "Discord command verification did not return a command list."
    )
  }
  const live = response.map(commandObject)
  const expectedNames = intended.map((command) => command.name).sort()
  const liveNames = live.map((command) => command.name).sort()
  if (JSON.stringify(expectedNames) !== JSON.stringify(liveNames)) {
    throw new Error(
      `Discord command verification failed: expected ${intended.length} commands [${expectedNames.join(", ")}], received ${live.length} [${liveNames.join(", ")}].`
    )
  }
  for (const expected of intended) {
    const actual = live.find((command) => command.name === expected.name)
    const scopedActual = {
      ...actual,
      // contexts controls DM availability. Compare the deprecated flag only
      // when the release explicitly supplies it, rather than its legacy default.
      dm_permission:
        expected.dm_permission === undefined ? undefined : actual?.dm_permission,
      contexts: expected.contexts === undefined ? undefined : actual?.contexts,
      integration_types:
        expected.integration_types === undefined
          ? undefined
          : actual?.integration_types,
    }
    if (
      !isDeepStrictEqual(
        normalizedDefinition(expected, "command"),
        normalizedDefinition(scopedActual, "command")
      )
    ) {
      throw new Error(
        `Discord command definition mismatch for /${expected.name}.`
      )
    }
  }
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
      throw new Error(
        `Command /${command.data.name} does not define execute().`
      )
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

  const application = commandObject(await rest.get(Routes.currentApplication()))
  if (application.id !== applicationId) {
    throw new Error(
      "DISCORD_APPLICATION_ID does not match the application authenticated by DISCORD_BOT_TOKEN."
    )
  }
  logInfo(`Authenticated Discord application ${applicationId}.`)

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

// Native entrypoint detection works through current and during packaging imports.
if (import.meta.main) {
  try {
    await registerCommands()
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error)

    logError("Failed to register Discord slash commands.", message)

    process.exitCode = 1
  }
}
