import {
  PermissionFlagsBits,
  type GuildBasedChannel,
  type GuildMember,
  type MessageCreateOptions,
  type PermissionsBitField,
} from "discord.js"

import {
  fetchDiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"
import { renderWelcomeCardMessage } from "@/services/welcomeCardRenderer"
import { botLogError } from "@/utils/botLog"
import type { LogMetadata } from "@workspace/logger"

type RuntimeConfigFetcher = (
  discordGuildId: string
) => Promise<DiscordGuildRuntimeConfigResult>

export type WelcomeMessageRenderer = (
  member: GuildMember
) => Promise<MessageCreateOptions> | MessageCreateOptions

export type WelcomeMessageDeliveryResult =
  | {
      status: "sent"
      channelId: string
    }
  | {
      status:
        | "ignoredBot"
        | "configUnavailable"
        | "welcomeDisabled"
        | "missingWelcomeChannel"
        | "channelUnavailable"
        | "channelUnsupported"
        | "botMemberUnavailable"
        | "missingBasePermissions"
        | "sendFailed"
      channelId?: string
      reason?: string
    }

type WelcomeMessageOptions = {
  fetchConfig?: RuntimeConfigFetcher
  renderWelcomeMessage?: WelcomeMessageRenderer
  renderRequiresAttachFiles?: boolean
  logError?: typeof botLogError
}

type WelcomeSendableChannel = GuildBasedChannel & {
  send(message: MessageCreateOptions): Promise<unknown>
  permissionsFor(member: GuildMember): Readonly<PermissionsBitField> | null
}

const baseWelcomePermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
] as const

export const WELCOME_TEXT_FALLBACK_POLICY =
  "If welcome-card rendering fails, Cleo sends a single text-only welcome message without embeds or attachments."

export async function handleGuildMemberWelcome(
  member: GuildMember,
  options: WelcomeMessageOptions = {}
): Promise<WelcomeMessageDeliveryResult> {
  if (member.user.bot) {
    return { status: "ignoredBot" }
  }

  const fetchConfig = options.fetchConfig ?? fetchDiscordGuildRuntimeConfig
  const logError = options.logError ?? botLogError
  const configResult = await fetchRuntimeConfigQuietly(member, fetchConfig, logError)

  if (configResult?.status !== "ready") {
    return {
      status: "configUnavailable",
      reason: configResult?.reason,
    }
  }

  const { welcomeChannelId, welcomeEnabled } = configResult.config

  if (!welcomeEnabled) {
    return { status: "welcomeDisabled" }
  }

  if (!welcomeChannelId) {
    return { status: "missingWelcomeChannel" }
  }

  const channel = await resolveConfiguredChannel(member, welcomeChannelId)

  if (!channel) {
    return {
      status: "channelUnavailable",
      channelId: welcomeChannelId,
    }
  }

  if (!isTextSendableChannel(channel)) {
    return {
      status: "channelUnsupported",
      channelId: welcomeChannelId,
    }
  }

  const botMember = member.guild.members.me
  if (!botMember) {
    return {
      status: "botMemberUnavailable",
      channelId: welcomeChannelId,
    }
  }

  const permissions = channel.permissionsFor(botMember)
  if (!permissions?.has(baseWelcomePermissions)) {
    return {
      status: "missingBasePermissions",
      channelId: welcomeChannelId,
    }
  }

  const renderRequiresAttachFiles = options.renderRequiresAttachFiles ?? true
  if (
    renderRequiresAttachFiles &&
    !permissions.has(PermissionFlagsBits.AttachFiles)
  ) {
    return await sendWelcomeMessage({
      member,
      channel,
      message: buildWelcomeTextFallback(member),
      logError,
    })
  }

  const renderedMessage = await buildWelcomeMessage(member, {
    config: configResult.config,
    renderWelcomeMessage: options.renderWelcomeMessage,
    logError,
  })
  const message = choosePermittedMessage(member, renderedMessage, permissions)

  return await sendWelcomeMessage({ member, channel, message, logError })
}

async function sendWelcomeMessage({
  member,
  channel,
  message,
  logError,
}: {
  member: GuildMember
  channel: WelcomeSendableChannel
  message: MessageCreateOptions
  logError: typeof botLogError
}): Promise<WelcomeMessageDeliveryResult> {
  try {
    await channel.send(message)
    return {
      status: "sent",
      channelId: channel.id,
    }
  } catch (error) {
    logError("Discord welcome message send failed.", error, {
      discordGuildId: member.guild.id,
      discordChannelId: channel.id,
      discordUserId: member.id,
    })
    return {
      status: "sendFailed",
      channelId: channel.id,
    }
  }
}

export function buildWelcomeTextFallback(member: GuildMember): MessageCreateOptions {
  return {
    content: [
      `Welcome <@${member.id}> to ${member.guild.name}`,
    ].join(" "),
    allowedMentions: {
      users: [member.id],
      roles: [],
      parse: [],
    },
  }
}

export function renderPlaceholderWelcomeMessage(
  member: GuildMember,
  config?: DiscordGuildRuntimeConfig
): Promise<MessageCreateOptions> {
  return renderWelcomeCardMessage(member, {
    subtext: config?.welcomeSubtext,
  })
}

async function fetchRuntimeConfigQuietly(
  member: GuildMember,
  fetchConfig: RuntimeConfigFetcher,
  logError: typeof botLogError
): Promise<DiscordGuildRuntimeConfigResult | null> {
  try {
    return await fetchConfig(member.guild.id)
  } catch (error) {
    logError("Discord welcome runtime config fetch failed.", error, {
      discordGuildId: member.guild.id,
      discordUserId: member.id,
    })
    return null
  }
}

async function resolveConfiguredChannel(
  member: GuildMember,
  channelId: string
): Promise<GuildBasedChannel | null> {
  const cachedChannel = member.guild.channels.cache.get(channelId)

  if (cachedChannel) {
    return cachedChannel
  }

  try {
    return await member.guild.channels.fetch(channelId)
  } catch {
    return null
  }
}

function isTextSendableChannel(
  channel: GuildBasedChannel | null
): channel is WelcomeSendableChannel {
  return Boolean(channel?.isTextBased() && channel.isSendable())
}

async function buildWelcomeMessage(
  member: GuildMember,
  options: Pick<WelcomeMessageOptions, "renderWelcomeMessage" | "logError"> & {
    config: DiscordGuildRuntimeConfig
  }
): Promise<MessageCreateOptions> {
  const renderWelcomeMessage =
    options.renderWelcomeMessage ??
    ((memberToRender) =>
      renderPlaceholderWelcomeMessage(memberToRender, options.config))
  const logError = options.logError ?? botLogError

  try {
    return await renderWelcomeMessage(member)
  } catch (error) {
    logError("Discord welcome message render failed; using text fallback.", error, {
      discordGuildId: member.guild.id,
      discordUserId: member.id,
      fallbackPolicy: WELCOME_TEXT_FALLBACK_POLICY,
    } satisfies LogMetadata)
    return buildWelcomeTextFallback(member)
  }
}

function choosePermittedMessage(
  member: GuildMember,
  message: MessageCreateOptions,
  permissions: Readonly<PermissionsBitField>
): MessageCreateOptions {
  if (usesAttachments(message) && !permissions.has(PermissionFlagsBits.AttachFiles)) {
    return buildWelcomeTextFallback(member)
  }

  if (usesEmbeds(message) && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    return buildWelcomeTextFallback(member)
  }

  return message
}

function usesAttachments(message: MessageCreateOptions): boolean {
  return Array.isArray(message.files) && message.files.length > 0
}

function usesEmbeds(message: MessageCreateOptions): boolean {
  return Array.isArray(message.embeds) && message.embeds.length > 0
}
