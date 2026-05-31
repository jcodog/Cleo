"use node"

import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { dashboardDiscordCompleteServerInstallResult } from "../../../../lib/validators"
import {
  buildRestVerifiedGuildInput,
  verifyBotCanAccessDiscordGuild,
  verifyUserCanManageDiscordGuild,
} from "../lib/restAccess"

export const complete = action({
  args: {
    installSessionId: v.id("discordGuildInstallSessions"),
  },
  returns: dashboardDiscordCompleteServerInstallResult,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context.getInstallSessionContext,
      { installSessionId: args.installSessionId }
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

    const botGuildResult = await verifyBotCanAccessDiscordGuild(
      context.session.discordGuildId
    )

    if (botGuildResult.status === "unavailable") {
      return {
        status: "botVerificationUnavailable" as const,
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

    const verifiedAt = Date.now()
    const guild = await ctx.runMutation(
      internal.mutations.dashboard.discord.guilds.upsertRestVerified.upsert,
      buildRestVerifiedGuildInput({
        botGuild: botGuildResult.guild,
        discordAccount: context.discordAccount,
        user: context.user,
        userGuild: userGuildResult.guild,
        verifiedAt,
      })
    )

    await ctx.runMutation(
      internal.mutations.dashboard.discord.installSessions.upsert.configured,
      {
        installSessionId: context.session._id,
      }
    )
    await ctx.runMutation(
      internal.mutations.dashboard.discord.guildAuditEvents
        .upsertDiscordAuditLogs.createDashboardAction,
      {
        guildId: guild._id,
        userId: context.user._id,
        eventType: "dashboard.server_install.completed",
        summary: "Dashboard server install completed",
        metadata: {
          installSessionId: context.session._id,
          discordGuildId: context.session.discordGuildId,
        },
      }
    )

    return {
      status: "completed" as const,
      discordGuildId: context.session.discordGuildId,
      targetPath: `/dashboard/${context.session.discordGuildId}`,
    }
  },
})
