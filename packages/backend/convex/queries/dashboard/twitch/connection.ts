import { v } from "convex/values"
import { query } from "../../../_generated/server"
import { requireCurrentUser } from "../../../lib/auth"

export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      providerAccountId: v.string(),
      username: v.optional(v.string()),
      displayName: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      hasBootstrapPermission: v.boolean(),
      syncedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect()
    const account = accounts.find((entry) => entry.provider === "twitch")
    if (!account) return null
    // Public metadata is a display projection, never a runtime authorization grant.
    return {
      providerAccountId: account.providerAccountId,
      ...(account.username ? { username: account.username } : {}),
      ...(account.displayName ? { displayName: account.displayName } : {}),
      ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
      hasBootstrapPermission: account.scopes.includes("channel:bot"),
      syncedAt: account.updatedAt,
    }
  },
})
