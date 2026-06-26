import { MessageFlags, type ChatInputCommandInteraction } from "discord.js"

import {
  convexBotClient,
  type DiscordProfileLookupResult,
} from "@/services/convexBotClient"
import {
  reportDiscordRuntimeError,
  type DiscordRuntimeErrorReporter,
} from "@/services/runtimeErrorReporter"
import { botLogError } from "@/utils/botLog"

type ProfileFetcher = (
  discordUserId: string
) => Promise<DiscordProfileLookupResult | null>

type ProfileLookupOptions = {
  fetchProfile?: ProfileFetcher
  logError?: typeof botLogError
  reportRuntimeError?: DiscordRuntimeErrorReporter
}

type LinkedProfile = Extract<DiscordProfileLookupResult, { status: "linked" }>

export async function handleProfileCommand(
  interaction: ChatInputCommandInteraction,
  options: ProfileLookupOptions = {}
): Promise<void> {
  const fetchProfile =
    options.fetchProfile ?? convexBotClient.fetchDiscordProfileByUserId
  const logError = options.logError ?? botLogError
  const reportRuntimeError =
    options.reportRuntimeError ?? reportDiscordRuntimeError

  let result: DiscordProfileLookupResult | null

  try {
    result = await fetchProfile(interaction.user.id)
  } catch (error) {
    logError("Discord profile lookup failed.", error, {
      commandName: interaction.commandName,
      interactionId: interaction.id,
      discordUserId: interaction.user.id,
    })

    await reportProfileRuntimeError({
      interaction,
      error,
      logError,
      reportRuntimeError,
    })

    await replyWithProfileContent(
      interaction,
      createBackendUnavailableProfileContent()
    )
    return
  }

  if (result === null) {
    const error = new Error("Convex profile lookup returned null.")

    logError("Discord profile lookup failed.", error, {
      commandName: interaction.commandName,
      interactionId: interaction.id,
      discordUserId: interaction.user.id,
    })

    await reportProfileRuntimeError({
      interaction,
      error,
      logError,
      reportRuntimeError,
    })

    await replyWithProfileContent(
      interaction,
      createBackendUnavailableProfileContent()
    )
    return
  }

  await replyWithProfileContent(interaction, createProfileContent(result))
}

export function createProfileContent(
  result: DiscordProfileLookupResult
): string {
  if (result.status === "unlinked") {
    return [
      "**Your Cleo profile**",
      "",
      "Linked: `No`",
      "Sign in to the Cleo dashboard and link Discord to view account details here.",
    ].join("\n")
  }

  const displayName =
    result.account.displayName ??
    result.discordIdentity.displayName ??
    result.discordIdentity.username ??
    "Not set"
  const discordName =
    result.discordIdentity.displayName ??
    result.discordIdentity.username ??
    "Linked"

  return [
    "**Your Cleo profile**",
    "",
    "Linked: `Yes`",
    `Name: \`${displayName}\``,
    `Account role: \`${formatRole(result.account.role)}\``,
    `Account status: \`${formatStatus(result.account.status)}\``,
    `Discord identity: \`${discordName}\``,
  ].join("\n")
}

export function createBackendUnavailableProfileContent(): string {
  return [
    "**Your Cleo profile**",
    "",
    "Profile data is temporarily unavailable.",
    "Try again once Cleo can reach the account backend.",
  ].join("\n")
}

async function replyWithProfileContent(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content,
  })
}

async function reportProfileRuntimeError(args: {
  interaction: ChatInputCommandInteraction
  error: unknown
  logError: typeof botLogError
  reportRuntimeError: DiscordRuntimeErrorReporter
}) {
  try {
    await args.reportRuntimeError({
      severity: "error",
      serviceArea: "backend",
      message: "Discord profile backend lookup failed.",
      error: args.error,
      commandName: args.interaction.commandName,
      operation: "fetchDiscordProfile",
      fingerprint: `profile:fetchDiscordProfile:${args.interaction.commandName}`,
      metadata: {
        interactionId: args.interaction.id,
      },
    })
  } catch (reportError) {
    args.logError("Discord profile runtime error report failed.", reportError, {
      commandName: args.interaction.commandName,
      interactionId: args.interaction.id,
      operation: "fetchDiscordProfile",
    })
  }
}

function formatRole(role: LinkedProfile["account"]["role"]): string {
  if (role === "superadmin") {
    return "Super Admin"
  }

  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`
}

function formatStatus(status: LinkedProfile["account"]["status"]): string {
  return status === "active" ? "Active" : "Disabled"
}
