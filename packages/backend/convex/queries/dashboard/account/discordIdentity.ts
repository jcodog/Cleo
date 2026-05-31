import { v } from "convex/values"
import { query } from "../../../_generated/server"
import { getCurrentUser } from "../../../lib/auth"
import { linkedAccountDoc } from "../../../lib/validators"

export const get = query({
  args: {},
  returns: v.union(linkedAccountDoc, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return null
    }

    return await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("provider"), "discord"))
      .first()
  },
})
