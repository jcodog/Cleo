import { v } from "convex/values"

import { mutation } from "../../../_generated/server"
import { requireCurrentUser } from "../../../lib/auth"

const CURRENT_ONBOARDING_VERSION = 1

export const complete = mutation({
  args: {},
  returns: v.object({
    onboardingCompletedAt: v.number(),
    onboardingVersion: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)

    if (
      user.onboardingCompletedAt !== undefined &&
      user.onboardingVersion === CURRENT_ONBOARDING_VERSION
    ) {
      return {
        onboardingCompletedAt: user.onboardingCompletedAt,
        onboardingVersion: user.onboardingVersion,
      }
    }

    const onboardingCompletedAt = Date.now()

    await ctx.db.patch(user._id, {
      onboardingCompletedAt,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
      updatedAt: onboardingCompletedAt,
    })

    return {
      onboardingCompletedAt,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
    }
  },
})
