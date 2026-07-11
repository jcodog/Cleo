import { v } from "convex/values"
import type { Id } from "../../../../_generated/dataModel"
import { internalMutation } from "../../../../_generated/server"

export const forGuild = internalMutation({
  args: {
    guildId: v.id("guilds"),
  },
  returns: v.id("guildConfigs"),
  handler: async (ctx, args): Promise<Id<"guildConfigs">> => {
    const existing = await ctx.db
      .query("guildConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", args.guildId))
      .unique()

    if (existing) {
      return existing._id
    }

    const now = Date.now()

    return await ctx.db.insert("guildConfigs", {
      guildId: args.guildId,
      aiEnabled: false,
      moderationEnabled: false,
      welcomeEnabled: false,
      loggingEnabled: false,
      commandPrefix: "/",
      createdAt: now,
      updatedAt: now,
    })
  },
})
