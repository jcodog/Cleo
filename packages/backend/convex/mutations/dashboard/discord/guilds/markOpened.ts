import { v } from "convex/values"
import { mutation } from "../../../../_generated/server"
import { requireDiscordGuildManager } from "../../../../lib/auth"

export const markOpened = mutation({
  args: {
    guildId: v.id("guilds"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireDiscordGuildManager(ctx, args.guildId)

    const now = Date.now()

    await ctx.db.patch(args.guildId, {
      lastOpenedAt: now,
    })

    return null
  },
})
