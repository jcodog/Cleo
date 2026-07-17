import { v } from "convex/values"

import { query } from "../../../_generated/server"
import { getCurrentUser } from "../../../lib/auth"

const onboardingAccount = v.object({
  displayName: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  onboardingCompletedAt: v.union(v.number(), v.null()),
  onboardingVersion: v.union(v.number(), v.null()),
})

const onboardingDiscordIdentity = v.object({
  username: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
})

export const get = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal("accountSyncPending") }),
    v.object({
      status: v.literal("ready"),
      account: onboardingAccount,
      discordIdentity: v.union(onboardingDiscordIdentity, v.null()),
    })
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return { status: "accountSyncPending" as const }
    }

    const discordIdentity = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("provider"), "discord"))
      .first()

    return {
      status: "ready" as const,
      account: {
        displayName: user.displayName ?? null,
        imageUrl: user.imageUrl ?? null,
        onboardingCompletedAt: user.onboardingCompletedAt ?? null,
        onboardingVersion: user.onboardingVersion ?? null,
      },
      discordIdentity: discordIdentity
        ? {
            username: discordIdentity.username ?? null,
            displayName: discordIdentity.displayName ?? null,
            avatarUrl: discordIdentity.avatarUrl ?? null,
          }
        : null,
    }
  },
})
