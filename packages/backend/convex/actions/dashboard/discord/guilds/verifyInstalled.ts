"use node"

import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { dashboardDiscordVerifyInstalledGuildResult } from "../../../../lib/validators"
import {
  buildRestVerifiedGuildInput,
  verifyBotCanAccessDiscordGuild,
  verifyUserCanManageDiscordGuild,
} from "../lib/restAccess"

export const verify = action({
  args: {
    discordGuildId: v.string(),
  },
  returns: dashboardDiscordVerifyInstalledGuildResult,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context
        .getInstallableGuildsContext,
      {}
    )

    if (context.status === "missingUser") {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    if (!context.discordAccount) {
      return { status: "missingDiscordIdentity" as const }
    }

    const userGuildResult = await verifyUserCanManageDiscordGuild({
      clerkUserId: context.user.clerkUserId,
      discordGuildId: args.discordGuildId,
    })

    if (userGuildResult.status === "unavailable") {
      return {
        status: "userGuildDiscoveryUnavailable" as const,
        reason: userGuildResult.reason,
        discordGuildId: args.discordGuildId,
      }
    }

    if (userGuildResult.status === "forbidden") {
      return {
        status: "forbidden" as const,
        reason: userGuildResult.reason,
        discordGuildId: args.discordGuildId,
      }
    }

    const botGuildResult = await verifyBotCanAccessDiscordGuild(
      args.discordGuildId
    )

    if (botGuildResult.status === "unavailable") {
      return {
        status: "botVerificationUnavailable" as const,
        reason: botGuildResult.reason,
        discordGuildId: args.discordGuildId,
      }
    }

    if (botGuildResult.status === "notInstalled") {
      return {
        status: "notInstalled" as const,
        discordGuildId: args.discordGuildId,
      }
    }

    await ctx.runMutation(
      internal.mutations.dashboard.discord.guilds.upsertRestVerified.upsert,
      buildRestVerifiedGuildInput({
        botGuild: botGuildResult.guild,
        discordAccount: context.discordAccount,
        user: context.user,
        userGuild: userGuildResult.guild,
        verifiedAt: Date.now(),
      })
    )

    return {
      status: "installed" as const,
      discordGuildId: args.discordGuildId,
      targetPath: `/dashboard/${args.discordGuildId}`,
    }
  },
})
