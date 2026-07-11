import {
  convexBotClient,
  type DiscordSupportTicketId,
  type DiscordSupportTicketOpenInput,
  type DiscordSupportTicketOpenResult,
} from "@/services/convexBotClient"
import {
  fetchDiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"
import {
  reportDiscordRuntimeError,
  type DiscordRuntimeErrorReporter,
} from "@/services/runtimeErrorReporter"
import { botLogError } from "@/utils/botLog"
import {
  ApplicationIntegrationType,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ForumChannel,
  type Guild,
  type GuildBasedChannel,
  type MessageCreateOptions,
} from "discord.js"

type SupportTicketOpener = (
  input: DiscordSupportTicketOpenInput
) => Promise<DiscordSupportTicketOpenResult | null>

type RuntimeConfigFetcher = (
  discordGuildId: string
) => Promise<DiscordGuildRuntimeConfigResult>

type SupportTicketReadyResult = Exclude<
  DiscordSupportTicketOpenResult,
  { status: "guildSupportUnavailable" }
>

type GuildSupportTicketResult = SupportTicketReadyResult & {
  scope: "guild"
}

type GuildSupportNotifier = (
  interaction: ChatInputCommandInteraction,
  result: GuildSupportTicketResult,
  saveRoutingThread: SupportRoutingThreadSaver
) => Promise<boolean>

type SupportRoutingThreadSaver = (
  ticketId: DiscordSupportTicketId,
  threadId: string
) => Promise<void>

type SupportTicketOptions = {
  fetchConfig?: RuntimeConfigFetcher
  openTicket?: SupportTicketOpener
  notifyGuildSupport?: GuildSupportNotifier
  saveRoutingThread?: SupportRoutingThreadSaver
  logError?: typeof botLogError
  reportRuntimeError?: DiscordRuntimeErrorReporter
}

type SendableGuildChannel = GuildBasedChannel & {
  send(message: MessageCreateOptions): Promise<unknown>
}

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
  options: SupportTicketOptions = {}
): Promise<void> {
  const logError = options.logError ?? botLogError
  const reportRuntimeError =
    options.reportRuntimeError ?? reportDiscordRuntimeError
  const discordGuildId =
    interaction.guildId && !isUserInstallInteraction(interaction)
      ? interaction.guildId
      : undefined

  if (discordGuildId) {
    const configResult = await fetchGuildSupportConfig(
      discordGuildId,
      options.fetchConfig ?? fetchDiscordGuildRuntimeConfig,
      logError
    )

    if (
      configResult?.status !== "ready" ||
      !isGuildSupportReady(configResult.config)
    ) {
      await replyPrivately(interaction, guildSupportUnavailableContent)
      return
    }
  }

  const input: DiscordSupportTicketOpenInput = {
    requesterDiscordUserId: interaction.user.id,
    ...(discordGuildId ? { discordGuildId } : {}),
    ...(interaction.options.getString("message")?.trim()
      ? { message: interaction.options.getString("message", true) }
      : {}),
  }
  let result: DiscordSupportTicketOpenResult | null

  try {
    result = await (
      options.openTicket ?? convexBotClient.openOrResumeSupportTicket
    )(input)
  } catch (error) {
    result = null
    logError("Discord support ticket open failed.", error, {
      commandName: interaction.commandName,
      discordGuildId,
      discordUserId: interaction.user.id,
    })
  }

  if (!result) {
    await reportSupportRuntimeError({
      error: new Error("Convex support ticket open returned no result."),
      interaction,
      logError,
      reportRuntimeError,
    })
    await replyPrivately(
      interaction,
      "Cleo support is temporarily unavailable. Please try again shortly."
    )
    return
  }

  if (result.status === "guildSupportUnavailable") {
    await replyPrivately(interaction, guildSupportUnavailableContent)
    return
  }

  if (result.scope === "jcn") {
    await replyPrivately(interaction, formatRequesterConfirmation(result))
    return
  }

  const guildResult: GuildSupportTicketResult = {
    ...result,
    scope: "guild",
  }
  let notified = false

  try {
    if (guildResult.status === "resumed" && !guildResult.submittedMessage) {
      notified = true
    } else {
      notified = await (
        options.notifyGuildSupport ?? notifyConfiguredGuildSupport
      )(
        interaction,
        guildResult,
        options.saveRoutingThread ??
          convexBotClient.setSupportTicketRoutingThread
      )
    }
  } catch (error) {
    logError("Discord guild support notification failed.", error, {
      commandName: interaction.commandName,
      discordGuildId,
      discordUserId: interaction.user.id,
      discordChannelId: guildResult.route?.targetId,
    })
  }

  if (!notified) {
    await reportSupportRuntimeError({
      error: new Error("Configured guild support destination was unavailable."),
      interaction,
      logError,
      reportRuntimeError,
    })
  }

  await replyPrivately(
    interaction,
    formatRequesterConfirmation(guildResult, !notified)
  )
}

export function isUserInstallInteraction(
  interaction: Pick<ChatInputCommandInteraction, "authorizingIntegrationOwners">
): boolean {
  return (
    interaction.authorizingIntegrationOwners[
      ApplicationIntegrationType.UserInstall
    ] !== undefined
  )
}

export function isGuildSupportReady(
  config: DiscordGuildRuntimeConfig
): boolean {
  return Boolean(
    config.supportEnabled &&
    config.supportTargetId &&
    config.supportTargetType &&
    config.supportStaffRoleIds?.length
  )
}

export function formatSupportStaffMessage(
  result: GuildSupportTicketResult,
  requesterDiscordUserId: string
): MessageCreateOptions {
  const isNew = result.status === "opened"
  const roleMentions =
    isNew && result.route
      ? result.route.staffRoleIds.map((roleId) => `<@&${roleId}>`).join(" ")
      : ""
  const lines = [
    roleMentions,
    `**${isNew ? "New" : "Updated"} Cleo support request**`,
    `Requester: <@${requesterDiscordUserId}>`,
    ...(result.submittedMessage
      ? ["", result.submittedMessage]
      : ["", "_No message was submitted with `/help`._"]),
  ].filter((line, index) => line.length > 0 || index > 0)

  return {
    content: lines.join("\n"),
    allowedMentions: {
      parse: [],
      roles: isNew ? (result.route?.staffRoleIds ?? []) : [],
      users: [],
    },
  }
}

async function notifyConfiguredGuildSupport(
  interaction: ChatInputCommandInteraction,
  result: GuildSupportTicketResult,
  saveRoutingThread: SupportRoutingThreadSaver
): Promise<boolean> {
  if (!result.route || !interaction.guild) {
    return false
  }

  const channel = await resolveGuildChannel(
    interaction.guild,
    result.route.targetId
  )

  if (!channel) {
    return false
  }

  const message = formatSupportStaffMessage(result, interaction.user.id)

  if (result.route.targetType === "forum") {
    if (channel.type !== ChannelType.GuildForum) {
      return false
    }

    if (result.route.threadId) {
      const existingThread = await resolveGuildChannel(
        interaction.guild,
        result.route.threadId
      )

      if (existingThread && isSendableGuildChannel(existingThread)) {
        await existingThread.send(message)
        return true
      }
    }

    const thread = await (channel as ForumChannel).threads.create({
      name: `Support · ${sanitizeThreadName(interaction.user.username)}`,
      message,
    })
    await saveRoutingThread(result.ticketId, thread.id)
    return true
  }

  if (!isSendableGuildChannel(channel)) {
    return false
  }

  await channel.send(message)
  return true
}

async function resolveGuildChannel(
  guild: Guild,
  channelId: string
): Promise<GuildBasedChannel | null> {
  const cached = guild.channels.cache.get(channelId)

  if (cached) {
    return cached
  }

  try {
    return await guild.channels.fetch(channelId)
  } catch {
    return null
  }
}

function isSendableGuildChannel(
  channel: GuildBasedChannel
): channel is SendableGuildChannel {
  return channel.isTextBased() && channel.isSendable()
}

function sanitizeThreadName(value: string): string {
  const normalized = value.replaceAll(/[\r\n]/g, " ").trim()

  return (normalized || "Discord user").slice(0, 80)
}

function formatRequesterConfirmation(
  result: SupportTicketReadyResult,
  notificationDelayed = false
): string {
  const action = result.status === "opened" ? "opened" : "resumed"

  if (result.scope === "jcn") {
    return `Your JCN support request has been ${action}. JCN staff can review it privately in Cleo.`
  }

  return notificationDelayed
    ? `Your server support request has been ${action} and saved. The configured Discord notification could not be delivered, but server managers can still review it in the Cleo dashboard.`
    : `Your server support request has been ${action} and routed privately to this server's configured support team.`
}

async function fetchGuildSupportConfig(
  discordGuildId: string,
  fetchConfig: RuntimeConfigFetcher,
  logError: typeof botLogError
): Promise<DiscordGuildRuntimeConfigResult | null> {
  try {
    return await fetchConfig(discordGuildId)
  } catch (error) {
    logError("Discord support runtime config fetch failed.", error, {
      discordGuildId,
    })
    return null
  }
}

async function replyPrivately(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  })
}

async function reportSupportRuntimeError(args: {
  error: unknown
  interaction: ChatInputCommandInteraction
  logError: typeof botLogError
  reportRuntimeError: DiscordRuntimeErrorReporter
}): Promise<void> {
  try {
    await args.reportRuntimeError({
      severity: "error",
      serviceArea: "command",
      message: "Discord support ticket routing failed.",
      error: args.error,
      discordGuildId: args.interaction.guildId ?? undefined,
      commandName: args.interaction.commandName,
      operation: "openOrRouteSupportTicket",
      fingerprint: `support:openOrRoute:${args.interaction.guildId ?? "jcn"}`,
      metadata: {
        requesterDiscordUserId: args.interaction.user.id,
      },
    })
  } catch (reportError) {
    args.logError("Discord support runtime error report failed.", reportError, {
      commandName: args.interaction.commandName,
      discordGuildId: args.interaction.guildId ?? undefined,
    })
  }
}

const guildSupportUnavailableContent =
  "This server has not configured Cleo support yet. Ask a server admin to configure Support in the Cleo dashboard. For Cleo product help, run `/help` in a DM with Cleo."
