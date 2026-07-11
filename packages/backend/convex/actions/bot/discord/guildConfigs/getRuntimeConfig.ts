"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { botDiscordGuildRuntimeConfigResult } from "../../../../lib/botDiscordGuildRuntimeConfig"
import { assertValidBotSecret } from "../lib/auth"
import { assertDiscordSnowflake } from "../lib/discordId"

export const fetch = action({
  args: {
    secret: v.string(),
    discordGuildId: v.string(),
  },
  returns: botDiscordGuildRuntimeConfigResult,
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    assertDiscordSnowflake("discordGuildId", args.discordGuildId)

    return await ctx.runQuery(
      internal.queries.bot.discord.guildConfigs.runtimeConfigByDiscordId.get,
      {
        discordGuildId: args.discordGuildId,
      }
    )
  },
})
