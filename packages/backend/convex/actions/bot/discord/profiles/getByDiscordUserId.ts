"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { botDiscordProfileResult } from "../../../../lib/botDiscordProfiles"
import { assertValidBotSecret } from "../lib/auth"
import { assertDiscordSnowflake } from "../lib/discordId"

export const get = action({
  args: {
    secret: v.string(),
    discordUserId: v.string(),
  },
  returns: botDiscordProfileResult,
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    assertDiscordSnowflake("discordUserId", args.discordUserId)

    return await ctx.runQuery(
      internal.queries.bot.discord.profiles.byDiscordUserId.get,
      {
        discordUserId: args.discordUserId,
      }
    )
  },
})
