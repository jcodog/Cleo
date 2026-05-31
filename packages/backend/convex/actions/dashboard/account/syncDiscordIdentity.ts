"use node"

import { ConvexError } from "convex/values"

import { internal } from "../../../_generated/api"
import { action } from "../../../_generated/server"
import { getClerkUser } from "../../../lib/clerkOAuth"
import { dashboardDiscordIdentitySyncResult } from "../../../lib/validators"

export const sync = action({
  args: {},
  returns: dashboardDiscordIdentitySyncResult,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    const existingContext = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context
        .getInstallableGuildsContext,
      {}
    )

    if (
      existingContext.status === "ready" &&
      existingContext.discordAccount !== null
    ) {
      return {
        status: "ready" as const,
      }
    }

    const clerkUserResult = await getClerkUser(identity.subject)

    if (clerkUserResult.status === "unavailable") {
      return {
        status: "unavailable" as const,
        reason: clerkUserResult.reason,
      }
    }

    await ctx.runMutation(
      internal.mutations.integrations.clerk.users.upsertFromWebhook,
      {
        data: clerkUserResult.user,
      }
    )

    const nextContext = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context
        .getInstallableGuildsContext,
      {}
    )
    const discordAccount =
      nextContext.status === "ready" ? nextContext.discordAccount : null

    if (!discordAccount) {
      return {
        status: "missingDiscordIdentity" as const,
      }
    }

    return {
      status: "ready" as const,
    }
  },
})
