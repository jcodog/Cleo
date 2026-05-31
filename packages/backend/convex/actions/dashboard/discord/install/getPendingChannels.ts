"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { fetchDiscordGuildChannels } from "../../../../lib/discordRest"
import { dashboardDiscordPendingChannelsResult } from "../../../../lib/validators"
import {
  verifyBotCanAccessDiscordGuild,
  verifyUserCanManageDiscordGuild,
} from "../lib/restAccess"

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

    if (context.status === "notFound") {
      return { status: "notFound" as const }
    }

    if (context.status === "forbidden") {
      return { status: "forbidden" as const }
    }

    const userGuildResult = await verifyUserCanManageDiscordGuild({
      clerkUserId: context.user.clerkUserId,
      discordGuildId: context.session.discordGuildId,
    })

    if (userGuildResult.status === "unavailable") {
      return {
        status: "userGuildDiscoveryUnavailable" as const,
        reason: userGuildResult.reason,
        discordGuildId: context.session.discordGuildId,
      }
    }

    if (userGuildResult.status === "forbidden") {
      return { status: "forbidden" as const }
    }

    if (!discordEnv.DISCORD_BOT_TOKEN) {
      return {
        status: "channelDiscoveryUnavailable" as const,
        reason: "discordBotTokenUnavailable" as const,
        discordGuildId: context.session.discordGuildId,
      }
    }

    const botGuildResult = await verifyBotCanAccessDiscordGuild(
      context.session.discordGuildId
    )

    if (botGuildResult.status === "unavailable") {
      return {
        status: "channelDiscoveryUnavailable" as const,
        reason: botGuildResult.reason,
        discordGuildId: context.session.discordGuildId,
      }
    }

    if (botGuildResult.status === "notInstalled") {
      return {
        status: "notInstalled" as const,
        discordGuildId: context.session.discordGuildId,
      }
    }

    const channels = await fetchDiscordGuildChannels(
      context.session.discordGuildId,
      discordEnv.DISCORD_BOT_TOKEN
    )

    if (channels.status === "notInstalled") {
      return {
        status: "notInstalled" as const,
        discordGuildId: context.session.discordGuildId,
      }
    }

    if (channels.status === "unavailable") {
      return {
        status: "channelDiscoveryUnavailable" as const,
        reason: channels.reason,
        discordGuildId: context.session.discordGuildId,
      }
    }

    return {
      status: "ready" as const,
      discordGuildId: context.session.discordGuildId,
      channels: channels.channels,
    }
  },
})
