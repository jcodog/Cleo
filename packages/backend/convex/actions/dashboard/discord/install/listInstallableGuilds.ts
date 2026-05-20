"use node"

import { ConvexError } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { dashboardDiscordInstallableGuildsResult } from "../../../../lib/validators"

export const list = action({
  args: {},
  returns: dashboardDiscordInstallableGuildsResult,
  handler: async (ctx) => {
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

    if (context.discordAccount.accessTokenSecretId === undefined) {
      return {
        status: "discordGuildDiscoveryUnavailable" as const,
        reason: "discordAccessTokenUnavailable" as const,
        guilds: context.guilds,
      }
    }

    return {
      status: "discordGuildDiscoveryUnavailable" as const,
      reason: "discordTokenResolutionUnavailable" as const,
      guilds: context.guilds,
    }
  },
})
