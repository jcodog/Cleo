import { redactLogText } from "@workspace/logger"
import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type PermissionResolvable,
} from "discord.js"

import {
  convexBotClient,
  type DiscordModerationActionRecord,
  type DiscordModerationActionRecordResult,
} from "@/services/convexBotClient"
import {
  fetchDiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"
import {
  reportDiscordRuntimeError,
  type DiscordRuntimeErrorReporter,
} from "@/services/runtimeErrorReporter"
import { botLogError } from "@/utils/botLog"

export type ModerationActionType = "ban" | "kick"

type ModerationFailureCode =
  | "guildOnly"
  | "moderationConfigUnavailable"
  | "moderationDisabled"
  | "actorMissingPermission"
  | "botMissingPermission"
  | "targetUnavailable"
  | "targetSelf"
  | "targetBot"
  | "targetOwner"
  | "actorRoleTooLow"
  | "botRoleTooLow"
  | "reasonTooLong"
  | "discordApiFailed"

type ModerationRuntimeConfigFetcher = (
  discordGuildId: string
) => Promise<DiscordGuildRuntimeConfigResult>

type ModerationActionRecorder = (
  action: DiscordModerationActionRecord
) => Promise<DiscordModerationActionRecordResult | null>

type ModerationDiscordExecutor = (
  actionType: ModerationActionType,
  targetMember: GuildMember,
  reason: string | undefined
) => Promise<void>

export type ModerationCommandResult =
  | {
      status: "success"
    }
  | {
      status: "denied"
      failureCode: ModerationFailureCode
    }
  | {
      status: "failed"
      failureCode: "discordApiFailed"
    }

type ModerationCommandOptions = {
  fetchConfig?: ModerationRuntimeConfigFetcher
  recordAction?: ModerationActionRecorder
  executeDiscordAction?: ModerationDiscordExecutor
  logError?: typeof botLogError
  reportRuntimeError?: DiscordRuntimeErrorReporter
  now?: () => number
}

type ReasonResult =
  | {
      status: "ready"
      reason?: string
    }
  | {
      status: "invalid"
      failureCode: "reasonTooLong"
    }

type ModerationTarget = {
  targetMember: GuildMember
  reason?: string
}

type DenialContext = {
  interaction: ChatInputCommandInteraction<"cached">
  actionType: ModerationActionType
  targetDiscordUserId: string
  reason?: string
  failureCode: ModerationFailureCode
  options: RequiredModerationDependencies
}

type RequiredModerationDependencies = {
  fetchConfig: ModerationRuntimeConfigFetcher
  recordAction: ModerationActionRecorder
  executeDiscordAction: ModerationDiscordExecutor
  logError: typeof botLogError
  reportRuntimeError: DiscordRuntimeErrorReporter
  now: () => number
}

const moderationActionLabels = {
  ban: "ban",
  kick: "kick",
} as const

const moderationActionPastTense = {
  ban: "banned",
  kick: "kicked",
} as const

const reasonMaxLength = 512

export async function handleModerationCommand(
  interaction: ChatInputCommandInteraction,
  actionType: ModerationActionType,
  options: ModerationCommandOptions = {}
): Promise<ModerationCommandResult> {
  const dependencies = withModerationDefaults(options)

  if (!interaction.inCachedGuild()) {
    await replyEphemeral(
      interaction,
      "This moderation command can only be used in a Discord server."
    )

    return {
      status: "denied",
      failureCode: "guildOnly",
    }
  }

  const targetUser = interaction.options.getUser("user", true)
  const targetMember = interaction.options.getMember("user")
  const reasonResult = sanitiseModerationReason(
    interaction.options.getString("reason") ?? undefined
  )

  if (reasonResult.status === "invalid") {
    return await denyModerationAction({
      interaction,
      actionType,
      targetDiscordUserId: targetUser.id,
      failureCode: reasonResult.failureCode,
      options: dependencies,
    })
  }

  if (!isGuildMemberLike(targetMember)) {
    return await denyModerationAction({
      interaction,
      actionType,
      targetDiscordUserId: targetUser.id,
      reason: reasonResult.reason,
      failureCode: "targetUnavailable",
      options: dependencies,
    })
  }

  const target = {
    targetMember,
    reason: reasonResult.reason,
  } satisfies ModerationTarget

  const configResult = await fetchModerationConfigQuietly(
    interaction,
    dependencies
  )

  if (configResult?.status !== "ready") {
    return await denyModerationAction({
      interaction,
      actionType,
      targetDiscordUserId: targetMember.id,
      reason: target.reason,
      failureCode: "moderationConfigUnavailable",
      options: dependencies,
    })
  }

  if (!configResult.config.moderationEnabled) {
    return await denyModerationAction({
      interaction,
      actionType,
      targetDiscordUserId: targetMember.id,
      reason: target.reason,
      failureCode: "moderationDisabled",
      options: dependencies,
    })
  }

  const denial = validateModerationPermissions(interaction, actionType, target)

  if (denial) {
    return await denyModerationAction({
      interaction,
      actionType,
      targetDiscordUserId: targetMember.id,
      reason: target.reason,
      failureCode: denial,
      options: dependencies,
    })
  }

  try {
    await dependencies.executeDiscordAction(
      actionType,
      target.targetMember,
      target.reason
    )
  } catch (error) {
    dependencies.logError("Discord moderation API action failed.", error, {
      discordGuildId: interaction.guildId,
      commandName: interaction.commandName,
      discordUserId: interaction.user.id,
      targetDiscordUserId: targetMember.id,
      actionType,
    })

    await recordModerationActionSafely({
      interaction,
      actionType,
      targetDiscordUserId: targetMember.id,
      reason: target.reason,
      result: "failed",
      failureCode: "discordApiFailed",
      options: dependencies,
    })

    await reportModerationRuntimeError({
      error,
      interaction,
      actionType,
      targetDiscordUserId: targetMember.id,
      operation: "executeDiscordModerationAction",
      message: "Discord moderation API action failed.",
      options: dependencies,
    })

    await replyEphemeral(
      interaction,
      `I could not ${moderationActionLabels[actionType]} that member.`
    )

    return {
      status: "failed",
      failureCode: "discordApiFailed",
    }
  }

  await recordModerationActionSafely({
    interaction,
    actionType,
    targetDiscordUserId: targetMember.id,
    reason: target.reason,
    result: "success",
    options: dependencies,
  })

  await replyEphemeral(
    interaction,
    `Member ${moderationActionPastTense[actionType]}.`
  )

  return {
    status: "success",
  }
}

export function sanitiseModerationReason(value: string | undefined): ReasonResult {
  const normalised = value?.trim()

  if (!normalised) {
    return {
      status: "ready",
    }
  }

  const redacted = redactLogText(normalised)

  if (redacted.length > reasonMaxLength) {
    return {
      status: "invalid",
      failureCode: "reasonTooLong",
    }
  }

  return {
    status: "ready",
    reason: redacted,
  }
}

export function validateModerationPermissions(
  interaction: ChatInputCommandInteraction<"cached">,
  actionType: ModerationActionType,
  target: ModerationTarget
): ModerationFailureCode | null {
  const requiredPermission = getRequiredPermission(actionType)
  const botMember = interaction.guild.members.me

  if (!interaction.memberPermissions?.has(requiredPermission)) {
    return "actorMissingPermission"
  }

  if (!botMember?.permissions.has(requiredPermission)) {
    return "botMissingPermission"
  }

  if (target.targetMember.id === interaction.user.id) {
    return "targetSelf"
  }

  if (target.targetMember.id === botMember.id) {
    return "targetBot"
  }

  if (target.targetMember.id === interaction.guild.ownerId) {
    return "targetOwner"
  }

  if (
    interaction.user.id !== interaction.guild.ownerId &&
    target.targetMember.roles.highest.position >=
      interaction.member.roles.highest.position
  ) {
    return "actorRoleTooLow"
  }

  if (
    target.targetMember.roles.highest.position >=
    botMember.roles.highest.position
  ) {
    return "botRoleTooLow"
  }

  return null
}

async function denyModerationAction({
  interaction,
  actionType,
  targetDiscordUserId,
  reason,
  failureCode,
  options,
}: DenialContext): Promise<ModerationCommandResult> {
  await recordModerationActionSafely({
    interaction,
    actionType,
    targetDiscordUserId,
    reason,
    result: "denied",
    failureCode,
    options,
  })

  await replyEphemeral(interaction, getDenialMessage(actionType, failureCode))

  return {
    status: "denied",
    failureCode,
  }
}

async function recordModerationActionSafely(args: {
  interaction: ChatInputCommandInteraction<"cached">
  actionType: ModerationActionType
  targetDiscordUserId: string
  reason?: string
  result: DiscordModerationActionRecord["result"]
  failureCode?: ModerationFailureCode
  options: RequiredModerationDependencies
}): Promise<void> {
  try {
    const result = await args.options.recordAction({
      discordGuildId: args.interaction.guildId,
      actionType: args.actionType,
      actorDiscordUserId: args.interaction.user.id,
      targetDiscordUserId: args.targetDiscordUserId,
      reason: args.reason,
      result: args.result,
      failureCode: args.failureCode,
      operationId: buildOperationId(args.interaction.id, args.actionType),
      metadata: {
        commandName: args.interaction.commandName,
        interactionId: args.interaction.id,
      },
      occurredAt: args.options.now(),
    })

    if (result !== null) {
      return
    }

    throw new Error("Convex moderation action record returned null.")
  } catch (error) {
    args.options.logError("Discord moderation action record failed.", error, {
      discordGuildId: args.interaction.guildId,
      commandName: args.interaction.commandName,
      discordUserId: args.interaction.user.id,
      targetDiscordUserId: args.targetDiscordUserId,
      actionType: args.actionType,
    })

    await reportModerationRuntimeError({
      error,
      interaction: args.interaction,
      actionType: args.actionType,
      targetDiscordUserId: args.targetDiscordUserId,
      operation: "recordModerationAction",
      message: "Discord moderation action record failed.",
      options: args.options,
    })
  }
}

async function reportModerationRuntimeError(args: {
  error: unknown
  interaction: ChatInputCommandInteraction<"cached">
  actionType: ModerationActionType
  targetDiscordUserId: string
  operation: "executeDiscordModerationAction" | "recordModerationAction"
  message: string
  options: RequiredModerationDependencies
}) {
  try {
    await args.options.reportRuntimeError({
      severity: "error",
      serviceArea: "moderation",
      message: args.message,
      error: args.error,
      discordGuildId: args.interaction.guildId,
      commandName: args.interaction.commandName,
      operation: args.operation,
      fingerprint: `moderation:${args.operation}:${args.interaction.guildId}:${args.actionType}`,
      metadata: {
        actionType: args.actionType,
        targetDiscordUserId: args.targetDiscordUserId,
        interactionId: args.interaction.id,
      },
    })
  } catch (reportError) {
    args.options.logError(
      "Discord moderation runtime error report failed.",
      reportError,
      {
        discordGuildId: args.interaction.guildId,
        commandName: args.interaction.commandName,
        operation: args.operation,
        actionType: args.actionType,
      }
    )
  }
}

async function fetchModerationConfigQuietly(
  interaction: ChatInputCommandInteraction<"cached">,
  options: RequiredModerationDependencies
): Promise<DiscordGuildRuntimeConfigResult | null> {
  try {
    return await options.fetchConfig(interaction.guildId)
  } catch (error) {
    options.logError("Discord moderation runtime config fetch failed.", error, {
      discordGuildId: interaction.guildId,
      commandName: interaction.commandName,
      discordUserId: interaction.user.id,
    })

    return null
  }
}

async function executeDiscordModerationAction(
  actionType: ModerationActionType,
  targetMember: GuildMember,
  reason: string | undefined
): Promise<void> {
  if (actionType === "ban") {
    await targetMember.ban({
      reason,
    })
    return
  }

  await targetMember.kick(reason)
}

function withModerationDefaults(
  options: ModerationCommandOptions
): RequiredModerationDependencies {
  return {
    fetchConfig: options.fetchConfig ?? fetchDiscordGuildRuntimeConfig,
    recordAction: options.recordAction ?? convexBotClient.recordModerationAction,
    executeDiscordAction:
      options.executeDiscordAction ?? executeDiscordModerationAction,
    logError: options.logError ?? botLogError,
    reportRuntimeError: options.reportRuntimeError ?? reportDiscordRuntimeError,
    now: options.now ?? Date.now,
  }
}

function getRequiredPermission(
  actionType: ModerationActionType
): PermissionResolvable {
  return actionType === "ban"
    ? PermissionFlagsBits.BanMembers
    : PermissionFlagsBits.KickMembers
}

function isGuildMemberLike(value: unknown): value is GuildMember {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "roles" in value &&
    "permissions" in value
  )
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ content })
    return
  }

  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  })
}

function getDenialMessage(
  actionType: ModerationActionType,
  failureCode: ModerationFailureCode
): string {
  switch (failureCode) {
    case "guildOnly":
      return "This moderation command can only be used in a Discord server."
    case "moderationConfigUnavailable":
      return "Moderation settings are not available for this server yet."
    case "moderationDisabled":
      return "Moderation actions are disabled for this server."
    case "actorMissingPermission":
      return `You need permission to ${moderationActionLabels[actionType]} members.`
    case "botMissingPermission":
      return `Cleo needs permission to ${moderationActionLabels[actionType]} members.`
    case "targetUnavailable":
      return "I could not find that server member."
    case "targetSelf":
      return "You cannot target yourself."
    case "targetBot":
      return "You cannot target Cleo."
    case "targetOwner":
      return "You cannot target the server owner."
    case "actorRoleTooLow":
      return "You cannot target a member with an equal or higher role."
    case "botRoleTooLow":
      return "Cleo's role is not high enough to target that member."
    case "reasonTooLong":
      return "The moderation reason must be 512 characters or fewer."
    case "discordApiFailed":
      return `I could not ${moderationActionLabels[actionType]} that member.`
  }
}

function buildOperationId(
  interactionId: string,
  actionType: ModerationActionType
): string {
  return `moderation:${actionType}:${interactionId}`
}
