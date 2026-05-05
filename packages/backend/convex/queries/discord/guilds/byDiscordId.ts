import { v } from "convex/values"
import { query } from "../../../_generated/server"

export const get = query({
  args: {
    discordGuildId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
  },
})
