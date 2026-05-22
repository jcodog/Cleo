"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { fetchDiscordGuildChannels } from "../../../../lib/discordRest"
import { dashboardDiscordPendingChannelsResult } from "../../../../lib/validators"

export const get = action({
  args: {
    installSessionId: v.optional(v.id("discordGuildInstallSessions")),
    discordGuildId: v.optional(v.string()),
  },
  returns: dashboardDiscordPendingChannelsResult,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context
        .getInstallSessionContext,
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
