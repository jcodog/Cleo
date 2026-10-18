"use node"

import { ConvexError, v } from "convex/values"

import { api, internal } from "../../../_generated/api"
import { action } from "../../../_generated/server"
import { getClerkUser } from "../../../lib/clerkOAuth"
import { dashboardLinkedAccountsSyncResult } from "../../../lib/validators"

export const sync = action({
  args: { reauthorizeTwitch: v.optional(v.boolean()) },
  returns: dashboardLinkedAccountsSyncResult,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    const clerkUserResult = await getClerkUser(identity.subject)

    if (clerkUserResult.status === "unavailable") {
      return {
        status: "unavailable" as const,
        reason: clerkUserResult.reason,
      }
    }

    const userId = await ctx.runMutation(
      internal.mutations.integrations.clerk.users.upsertFromWebhook,
      {
        data: clerkUserResult.user,
      }
    )
    if (args.reauthorizeTwitch)
      await ctx.runAction(internal.twitchChatActions.syncUser, {
        userId,
        reauthorize: true,
      })

    const linkedAccounts = await ctx.runQuery(
      api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
      {}
    )

    return {
      status: "ready" as const,
      linkedAccounts,
    }
  },
})
