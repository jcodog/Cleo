import { v } from "convex/values"
import { query } from "../../../_generated/server"
import { guildConfigDoc } from "../../../lib/validators"

export const get = query({
  args: {
    guildId: v.id("guilds"),
  },
  returns: v.union(guildConfigDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guildConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", args.guildId))
      .unique()
  },
})
