import { ConvexError, v } from "convex/values"
import { now as timeNow } from "../../../../../src/lib/time"
import type { Id } from "../../../../_generated/dataModel"
import { mutation } from "../../../../_generated/server"
import { linkedProvider } from "../../../../dbTables/shared"
import { requireCurrentUser } from "../../../../lib/auth"

export const upsertForCurrentUser = mutation({
  args: {
    provider: linkedProvider,
    externalProvider: v.optional(v.string()),
    providerAccountId: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    scopes: v.array(v.string()),
    accessTokenSecretId: v.optional(v.string()),
    refreshTokenSecretId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("linkedAccounts"),
  handler: async (ctx, args): Promise<Id<"linkedAccounts">> => {
    const user = await requireCurrentUser(ctx)
    const now = timeNow()

    const existing = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q
          .eq("provider", args.provider)
          .eq("providerAccountId", args.providerAccountId)
      )
      .unique()

    if (existing && existing.userId !== user._id) {
      throw new ConvexError({
        code: "ACCOUNT_ALREADY_LINKED",
        message: "This account is already linked to another Cleo user.",
      })
    }

    const value = {
      userId: user._id,
      provider: args.provider,
      ...(args.externalProvider !== undefined
        ? { externalProvider: args.externalProvider }
        : {}),
      providerAccountId: args.providerAccountId,
      scopes: args.scopes,
      ...(args.username !== undefined ? { username: args.username } : {}),
      ...(args.displayName !== undefined
        ? { displayName: args.displayName }
        : {}),
      ...(args.avatarUrl !== undefined ? { avatarUrl: args.avatarUrl } : {}),
      ...(args.accessTokenSecretId !== undefined
        ? { accessTokenSecretId: args.accessTokenSecretId }
        : {}),
      ...(args.refreshTokenSecretId !== undefined
        ? { refreshTokenSecretId: args.refreshTokenSecretId }
        : {}),
      ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt } : {}),
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, value)
      return existing._id
    }

    return await ctx.db.insert("linkedAccounts", {
      ...value,
      createdAt: now,
    })
  },
})
