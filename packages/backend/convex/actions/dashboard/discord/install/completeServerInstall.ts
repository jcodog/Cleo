"use node"

import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { dashboardDiscordCompleteServerInstallResult } from "../../../../lib/validators"

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

    const access = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context
        .getCreateServerInstallContext,
      { discordGuildId: context.session.discordGuildId }
    )

    if (access.status !== "alreadyInstalled") {
      return { status: "forbidden" as const }
    }

    await ctx.runMutation(
      internal.mutations.bot.discord.guildConfigs.ensure.forGuild,
      {
        guildId: context.guild._id,
      }
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
        guildId: context.guild._id,
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
