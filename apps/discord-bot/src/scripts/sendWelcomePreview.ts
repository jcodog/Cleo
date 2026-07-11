import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Guild,
  type GuildMember,
} from "discord.js"

import { discordEnv } from "@workspace/env/discord"
import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"

import {
  fetchDiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"
import {
  buildWelcomeTextFallback,
  handleGuildMemberWelcome,
  type WelcomeMessageDeliveryResult,
  type WelcomeMessageRenderer,
} from "@/services/welcomeMessages"
import { renderWelcomeCardMessage } from "@/services/welcomeCardRenderer"
import { botLog, botLogError } from "@/utils/botLog"

type WelcomePreviewTarget = {
  guildId: string
  userQuery: string
  channelId?: string
  message?: string
  subtext?: string
  mode: WelcomePreviewMode
}

type WelcomePreviewMode = "card" | "fallback" | "both"

type SendWelcomePreviewOptions = {
  args?: readonly string[]
  token?: string
  testGuildId?: string
  createClient?: () => Client
}

type ProcessEnv = {
  DISCORD_WELCOME_PREVIEW_USER?: string
}

export function resolveWelcomePreviewTarget(
  args: readonly string[] = process.argv,
  testGuildId: string | undefined = discordEnv.DISCORD_TEST_GUILD_ID,
  env: ProcessEnv = process.env
): WelcomePreviewTarget {
  const guildId =
    readArgValue(args, "--guild") ??
    readArgValue(args, "--guild-id") ??
    testGuildId
  const userQuery =
    readArgValue(args, "--user") ??
    readArgValue(args, "--username") ??
    readArgValue(args, "--user-id") ??
    env.DISCORD_WELCOME_PREVIEW_USER
  const channelId =
    readArgValue(args, "--channel") ?? readArgValue(args, "--channel-id")
  const message = readArgValue(args, "--message")
  const subtext = readArgValue(args, "--subtext")
  const mode = resolvePreviewMode(args)

  if (!guildId) {
    throw new Error(
      "Missing guild ID. Pass --guild=<guild_id> or set DISCORD_TEST_GUILD_ID."
    )
  }

  if (!isDiscordSnowflake(guildId)) {
    throw new Error("Guild ID must be a Discord snowflake.")
  }

  if (!userQuery?.trim()) {
    throw new Error(
      "Missing preview user. Pass --user=<discord_user_id_or_username> or set DISCORD_WELCOME_PREVIEW_USER."
    )
  }

  if (channelId !== undefined && !isDiscordSnowflake(channelId)) {
    throw new Error("Channel ID must be a Discord snowflake.")
  }

  return {
    guildId,
    userQuery: userQuery.trim(),
    ...(channelId !== undefined ? { channelId } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(subtext !== undefined ? { subtext } : {}),
    mode,
  }
}

export async function sendWelcomePreview(
  options: SendWelcomePreviewOptions = {}
): Promise<void> {
  const token = options.token ?? discordEnv.DISCORD_BOT_TOKEN

  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN.")
  }

  const target = resolveWelcomePreviewTarget(options.args, options.testGuildId)
  const client =
    options.createClient?.() ??
    new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
      partials: [Partials.GuildMember, Partials.User],
    })

  try {
    await client.login(token)
    await waitForClientReady(client)

    const guild = await client.guilds.fetch(target.guildId)
    const member = await resolveGuildMember(guild, target.userQuery)

    botLog(
      `Sending welcome preview for ${formatMemberLabel(member)} in ${guild.name} (${guild.id}).`,
      "info"
    )

    const runtimeConfigResult = await fetchDiscordGuildRuntimeConfig(guild.id)
    const previewConfig = resolvePreviewConfig(runtimeConfigResult, {
      guildId: guild.id,
      channelId: target.channelId,
      subtext: target.subtext,
    })
    const previewRuns = createPreviewRuns(target, previewConfig)

    for (const previewRun of previewRuns) {
      const result = await handleGuildMemberWelcome(member, {
        fetchConfig: async () => ({
          status: "ready",
          config: previewConfig,
        }),
        renderWelcomeMessage: previewRun.renderWelcomeMessage,
        renderRequiresAttachFiles: previewRun.renderRequiresAttachFiles,
      })

      logPreviewResult(previewRun.label, result)
    }
  } finally {
    client.destroy()
  }
}

function resolvePreviewConfig(
  runtimeConfigResult: DiscordGuildRuntimeConfigResult,
  options: {
    guildId: string
    channelId?: string
    subtext?: string
  }
): DiscordGuildRuntimeConfig {
  const existingConfig =
    runtimeConfigResult.status === "ready"
      ? runtimeConfigResult.config
      : {
          discordGuildId: options.guildId,
          moderationEnabled: false,
          welcomeEnabled: false,
          loggingEnabled: false,
          supportEnabled: false,
        }
  const welcomeChannelId = options.channelId ?? existingConfig.welcomeChannelId

  if (!welcomeChannelId) {
    throw new Error(
      "Missing welcome channel. Pass --channel=<channel_id> or configure welcomeChannelId in the dashboard."
    )
  }

  return {
    ...existingConfig,
    discordGuildId: options.guildId,
    welcomeEnabled: true,
    welcomeChannelId,
    ...(options.subtext !== undefined
      ? { welcomeSubtext: options.subtext }
      : {}),
  }
}

function createPreviewRuns(
  target: WelcomePreviewTarget,
  config: DiscordGuildRuntimeConfig
): Array<{
  label: string
  renderWelcomeMessage: WelcomeMessageRenderer
  renderRequiresAttachFiles: boolean
}> {
  const cardRun = {
    label: "image card",
    renderWelcomeMessage: async (member: GuildMember) =>
      withPreviewContent(
        await renderWelcomeCardMessage(member, {
          subtext: config.welcomeSubtext,
        }),
        member,
        target
      ),
    renderRequiresAttachFiles: true,
  }
  const fallbackRun = {
    label: "text fallback",
    renderWelcomeMessage: (member: GuildMember) =>
      withPreviewContent(buildWelcomeTextFallback(member), member, target),
    renderRequiresAttachFiles: false,
  }

  if (target.mode === "card") {
    return [cardRun]
  }

  if (target.mode === "fallback") {
    return [fallbackRun]
  }

  return [cardRun, fallbackRun]
}

function withPreviewContent(
  message: Awaited<ReturnType<WelcomeMessageRenderer>>,
  member: GuildMember,
  target: WelcomePreviewTarget
): Awaited<ReturnType<WelcomeMessageRenderer>> {
  if (target.message === undefined) {
    return message
  }

  return {
    ...message,
    content: formatPreviewMessage(target.message, member),
    allowedMentions: {
      users: [member.id],
      roles: [],
      parse: [],
    },
  }
}

function formatPreviewMessage(template: string, member: GuildMember): string {
  return template
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{guild}", member.guild.name)
    .replaceAll("{username}", member.displayName || member.user.username)
}

function logPreviewResult(
  label: string,
  result: WelcomeMessageDeliveryResult
): void {
  if (result.status === "sent") {
    botLog(
      `Welcome preview ${label} sent to channel ${result.channelId}.`,
      "success"
    )
    return
  }

  botLog(`${label}: ${formatPreviewNoopMessage(result)}`, "warn")
}

function formatPreviewNoopMessage(
  result: Awaited<ReturnType<typeof handleGuildMemberWelcome>>
): string {
  const channelDetail = result.channelId ? ` channel=${result.channelId};` : ""
  const reasonDetail =
    "reason" in result && result.reason ? ` reason=${result.reason};` : ""

  return `Welcome preview did not send.${channelDetail}${reasonDetail} status=${result.status}.`
}

function resolvePreviewMode(args: readonly string[]): WelcomePreviewMode {
  const explicitMode = readArgValue(args, "--mode")

  if (explicitMode !== undefined) {
    if (
      explicitMode === "card" ||
      explicitMode === "fallback" ||
      explicitMode === "both"
    ) {
      return explicitMode
    }

    throw new Error('Invalid --mode. Expected "card", "fallback", or "both".')
  }

  if (args.includes("--both")) {
    return "both"
  }

  if (args.includes("--fallback")) {
    return "fallback"
  }

  return "card"
}

async function resolveGuildMember(
  guild: Guild,
  userQuery: string
): Promise<GuildMember> {
  if (isDiscordSnowflake(userQuery)) {
    return await guild.members.fetch(userQuery)
  }

  const members = await guild.members.search({
    query: userQuery,
    limit: 10,
  })
  const candidates = Array.from(members.values())

  if (candidates.length === 0) {
    throw new Error(
      `No guild member matched "${userQuery}". Try the Discord user ID instead.`
    )
  }

  const exactMatches = candidates.filter((member) =>
    memberMatchesQuery(member, userQuery)
  )

  if (exactMatches.length === 1) {
    return firstGuildMember(exactMatches)
  }

  if (candidates.length === 1) {
    return firstGuildMember(candidates)
  }

  throw new Error(
    `Multiple guild members matched "${userQuery}": ${candidates
      .map(formatMemberLabel)
      .join(", ")}. Re-run with --user=<discord_user_id>.`
  )
}

function firstGuildMember(members: readonly GuildMember[]): GuildMember {
  const member = members[0]

  if (!member) {
    throw new Error("Expected at least one guild member.")
  }

  return member
}

function memberMatchesQuery(member: GuildMember, userQuery: string): boolean {
  const normalizedQuery = normalizeLookupText(userQuery)
  const globalName =
    "globalName" in member.user && typeof member.user.globalName === "string"
      ? member.user.globalName
      : undefined

  return [
    member.id,
    member.user.username,
    member.user.tag,
    member.displayName,
    globalName,
  ]
    .filter((value): value is string => typeof value === "string")
    .some((value) => normalizeLookupText(value) === normalizedQuery)
}

function formatMemberLabel(member: GuildMember): string {
  return `${member.user.tag} (${member.id})`
}

function normalizeLookupText(value: string): string {
  return value.trim().toLowerCase()
}

function waitForClientReady(client: Client): Promise<void> {
  if (client.isReady()) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    client.once(Events.ClientReady, () => resolve())
  })
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

  const value = args[flagIndex + 1]

  return value?.startsWith("--") ? undefined : value
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
    await sendWelcomePreview()
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error)

    botLogError("Failed to send Discord welcome preview.", message)

    process.exitCode = 1
  }
}
