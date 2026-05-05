import { now as timeNow } from "../../../src/lib/time"
import { ConvexError, v } from "convex/values"

import { mutation } from "../../_generated/server"

export const upsertFromAuth = mutation({
  args: {
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    const now = timeNow()
    const workosUserId = identity.subject
    const email = identity.email ?? args.email

    if (!email) {
      throw new ConvexError({
        code: "EMAIL_REQUIRED",
        message: "A verified email address is required.",
      })
    }

    const displayName =
      args.displayName ??
      identity.name ??
      identity.nickname ??
      identity.preferredUsername ??
      undefined

    const imageUrl = args.imageUrl ?? identity.pictureUrl ?? undefined

    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        ...(displayName !== undefined ? { displayName } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        updatedAt: now,
      })

      return existing._id
    }

    return await ctx.db.insert("users", {
      workosUserId,
      email,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
  },
})
