"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { dashboardDiscordPendingChannelsResult } from "../../../../lib/validators"

const DISCORD_API_BASE_URL = "https://discord.com/api/v10"
const DISCORD_GUILD_TEXT_CHANNEL = 0
const DISCORD_GUILD_ANNOUNCEMENT_CHANNEL = 5

type DiscordChannel = {
  id: string
  name?: string | null
  type: number
  position?: number
}

export const get = action({
  args: {
    installSessionId: v.optional(v.id("discordGuildInstallSessions")),
    discordGuildId: v.optional(v.string()),
  },
  returns: dashboardDiscordPendingChannelsResult,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context.getInstallSessionContext,
      args
    )

    if (context.status === "missingUser") {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    if (context.status === "missingDiscordIdentity") {
      return { status: "missingDiscordIdentity" as const }
    }

    if (context.status === "notFound" || context.status === "forbidden") {
      return { status: context.status }
    }

    if (
      context.guild === null ||
      context.guild.botJoinedAt === undefined ||
      context.guild.botLeftAt !== undefined
    ) {
      return {
        status: "pendingBotSync" as const,
        discordGuildId: context.session.discordGuildId,
      }
    }

    if (!discordEnv.DISCORD_BOT_TOKEN) {
      return {
        status: "channelDiscoveryUnavailable" as const,
        reason: "discordBotTokenUnavailable" as const,
        discordGuildId: context.session.discordGuildId,
      }
    }

    const channels = await fetchDiscordGuildChannels(
      context.session.discordGuildId,
      discordEnv.DISCORD_BOT_TOKEN
    )

    if (!channels) {
      return {
        status: "channelDiscoveryUnavailable" as const,
        reason: "discordApiUnavailable" as const,
        discordGuildId: context.session.discordGuildId,
      }
    }

    return {
      status: "ready" as const,
      discordGuildId: context.session.discordGuildId,
      channels,
    }
  },
})

async function fetchDiscordGuildChannels(
  discordGuildId: string,
  botToken: string
) {
  const response = await fetch(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}/channels`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  )

  if (!response.ok) {
    return null
  }

  const json: unknown = await response.json()

  if (!isDiscordChannels(json)) {
    return null
  }

  return json
    .filter(
      (channel) =>
        channel.name &&
        (channel.type === DISCORD_GUILD_TEXT_CHANNEL ||
          channel.type === DISCORD_GUILD_ANNOUNCEMENT_CHANNEL)
    )
    .map((channel) => ({
      discordChannelId: channel.id,
      name: channel.name ?? channel.id,
      type:
        channel.type === DISCORD_GUILD_ANNOUNCEMENT_CHANNEL
          ? ("announcement" as const)
          : ("text" as const),
      ...(channel.position !== undefined ? { position: channel.position } : {}),
    }))
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
}

function isDiscordChannels(value: unknown): value is DiscordChannel[] {
  return (
    Array.isArray(value) &&
    value.every(
      (channel) =>
        typeof channel === "object" &&
        channel !== null &&
        "id" in channel &&
        typeof channel.id === "string" &&
        "type" in channel &&
        typeof channel.type === "number" &&
        (!("name" in channel) ||
          typeof channel.name === "string" ||
          channel.name === null) &&
        (!("position" in channel) || typeof channel.position === "number")
    )
  )
}
