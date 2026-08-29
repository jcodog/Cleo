"use node"

import { ConvexError } from "convex/values"

import { api, internal } from "../../../_generated/api"
import { action } from "../../../_generated/server"
import { getClerkUser } from "../../../lib/clerkOAuth"
import { dashboardLinkedAccountsSyncResult } from "../../../lib/validators"

export const sync = action({
  args: {},
  returns: dashboardLinkedAccountsSyncResult,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    const existingLinkedAccounts = await ctx.runQuery(
      api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
      {}
    )

    if (existingLinkedAccounts.some((account) => account.provider === "discord")) {
      return {
        status: "ready" as const,
        linkedAccounts: existingLinkedAccounts,
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
