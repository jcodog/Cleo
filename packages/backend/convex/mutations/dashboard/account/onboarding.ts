import { v } from "convex/values"

import { mutation } from "../../../_generated/server"
import { requireCurrentUser } from "../../../lib/auth"
import {
  CURRENT_ONBOARDING_VERSION,
  getOnboardingProvenance,
  isCurrentOnboardingComplete,
} from "../../../../src/shared/onboarding"

const onboardingResult = v.object({
  onboardingCompletedAt: v.union(v.number(), v.null()),
  onboardingVersion: v.union(v.number(), v.null()),
  onboardingProvenance: v.union(
    v.literal("pre-rollout"),
    v.literal("post-rollout")
  ),
})

export const resolveProvenance = mutation({
  args: {},
  returns: onboardingResult,
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const onboardingProvenance =
      user.onboardingProvenance ?? getOnboardingProvenance(user.createdAt)

    if (onboardingProvenance === "pre-rollout") {
      const onboardingCompletedAt = user.onboardingCompletedAt ?? user.createdAt
      const onboardingVersion = Math.max(
        user.onboardingVersion ?? 0,
        CURRENT_ONBOARDING_VERSION
      )

      if (
        user.onboardingCompletedAt === undefined ||
        user.onboardingVersion === undefined ||
        user.onboardingVersion < CURRENT_ONBOARDING_VERSION ||
        user.onboardingProvenance === undefined
      ) {
        await ctx.db.patch(user._id, {
          onboardingCompletedAt,
          onboardingVersion,
          onboardingProvenance,
        })
      }

      return {
        onboardingCompletedAt,
        onboardingVersion,
        onboardingProvenance,
      }
    }

    if (user.onboardingProvenance !== undefined) {
      return {
        onboardingCompletedAt: user.onboardingCompletedAt ?? null,
        onboardingVersion: user.onboardingVersion ?? null,
        onboardingProvenance,
      }
    }

    await ctx.db.patch(user._id, { onboardingProvenance })

    return {
      onboardingCompletedAt: user.onboardingCompletedAt ?? null,
      onboardingVersion: user.onboardingVersion ?? null,
      onboardingProvenance,
    }
  },
})

export const complete = mutation({
  args: {},
  returns: onboardingResult,
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const onboardingProvenance =
      user.onboardingProvenance ?? getOnboardingProvenance(user.createdAt)

    if (isCurrentOnboardingComplete(user)) {
      if (user.onboardingProvenance === undefined) {
        await ctx.db.patch(user._id, { onboardingProvenance })
      }

      return {
        onboardingCompletedAt: user.onboardingCompletedAt ?? null,
        onboardingVersion: user.onboardingVersion ?? null,
        onboardingProvenance,
      }
    }

    const onboardingCompletedAt = user.onboardingCompletedAt ?? Date.now()
    const onboardingVersion = Math.max(
      user.onboardingVersion ?? 0,
      CURRENT_ONBOARDING_VERSION
    )

    await ctx.db.patch(user._id, {
      onboardingCompletedAt,
      onboardingVersion,
      onboardingProvenance,
      updatedAt: Date.now(),
    })

    return {
      onboardingCompletedAt,
      onboardingVersion,
      onboardingProvenance,
    }
  },
})
