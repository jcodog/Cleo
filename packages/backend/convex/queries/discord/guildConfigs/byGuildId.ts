import { v } from "convex/values"
import { query } from "../../../_generated/server"

export const get = query({
  args: {
    guildId: v.id("guilds"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guildConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", args.guildId))
      .unique()
  },
})
