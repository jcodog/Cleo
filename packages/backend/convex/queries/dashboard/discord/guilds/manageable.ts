import { v } from "convex/values"
import { query } from "../../../../_generated/server"
import { requireCurrentUser } from "../../../../lib/auth"
import { discordGuildMembershipDoc } from "../../../../lib/validators"

export const list = query({
  args: {},
  returns: v.array(discordGuildMembershipDoc),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)

    const discordAccount = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("provider"), "discord"))
      .first()

    if (!discordAccount) {
      return []
    }

    const memberships = await ctx.db
      .query("discordGuildMemberships")
      .withIndex("by_discord_user_id", (q) =>
        q.eq("discordUserId", discordAccount.providerAccountId)
      )
      .collect()

    return memberships.filter(
      (membership) =>
        membership.canManage && membership.managementVerifiedAt !== undefined
    )
  },
})
