import { ConvexError, v } from "convex/values"
import { now as timeNow } from "@backend"
import { mutation } from "../../_generated/server"
import { linkedProvider } from "../../dbTables/shared"

export const upsertForCurrentUser = mutation({
  args: {
    provider: linkedProvider,
    providerAccountId: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    scopes: v.array(v.string()),
    accessTokenSecretId: v.optional(v.string()),
    refreshTokenSecretId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) =>
        q.eq("workosUserId", identity.subject)
      )
      .unique()

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_PROVISIONED",
        message: "The signed-in user has not been provisioned.",
      })
    }

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
