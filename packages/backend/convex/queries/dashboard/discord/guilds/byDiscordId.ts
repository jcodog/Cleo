import { v } from "convex/values"
import { query } from "../../../../_generated/server"
import {
  requireDiscordGuildManager,
  requireCurrentUser,
} from "../../../../lib/auth"
import { guildDoc } from "../../../../lib/validators"

export const get = query({
  args: {
    discordGuildId: v.string(),
  },
  returns: v.union(guildDoc, v.null()),
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx)

    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (!guild) {
      return null
    }

    await requireDiscordGuildManager(ctx, guild._id)

    return guild
  },
})
