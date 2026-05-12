import { v } from "convex/values"
import { query } from "../../../_generated/server"
import { requireDiscordGuildManager } from "../../../lib/auth"
import { guildConfigDoc } from "../../../lib/validators"

export const get = query({
  args: {
    guildId: v.id("guilds"),
  },
  returns: v.union(guildConfigDoc, v.null()),
  handler: async (ctx, args) => {
    await requireDiscordGuildManager(ctx, args.guildId)

    return await ctx.db
      .query("guildConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", args.guildId))
      .unique()
  },
})
