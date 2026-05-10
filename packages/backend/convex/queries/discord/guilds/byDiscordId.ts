import { v } from "convex/values"
import { query } from "../../../_generated/server"
import { guildDoc } from "../../../lib/validators"

export const get = query({
  args: {
    discordGuildId: v.string(),
  },
  returns: v.union(guildDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
  },
})
