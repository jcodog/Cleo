"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { assertValidBotSecret } from "../lib/auth"
import {
  assertOptionalGuildName,
} from "./lib/gatewayGuild"
import { assertDiscordSnowflake } from "../lib/discordId"

export const sync = action({
  args: {
    secret: v.string(),
    guild: v.object({
      discordGuildId: v.string(),
      name: v.optional(v.string()),
      leftAt: v.optional(v.number()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    assertDiscordSnowflake("discordGuildId", args.guild.discordGuildId)
    assertOptionalGuildName(args.guild.name)

    await ctx.runMutation(
      internal.mutations.bot.discord.guilds.markBotLeft.mark,
      args.guild
    )

    return null
  },
})
