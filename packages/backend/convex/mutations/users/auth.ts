import { now as timeNow } from "../../../src/lib/time"
import { ConvexError, v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { mutation } from "../../_generated/server"
import { getCurrentIdentity } from "../../lib/auth"

export const upsertFromAuth = mutation({
  args: {
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    const identity = await getCurrentIdentity(ctx)

    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    const now = timeNow()
    const clerkUserId = identity.subject
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
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
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
      clerkUserId,
      email,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      role: "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  },
})
