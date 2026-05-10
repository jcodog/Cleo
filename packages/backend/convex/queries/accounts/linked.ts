import { v } from "convex/values"
import { query } from "../../_generated/server"
import { getCurrentUser } from "../../lib/auth"
import { linkedAccountDoc } from "../../lib/validators"

export const listForCurrentUser = query({
  args: {},
  returns: v.array(linkedAccountDoc),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return []
    }

    return await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect()
  },
})
