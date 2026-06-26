"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { discordGuildEventRecordInput } from "../../../../lib/discordGuildEvents"
import { assertValidBotSecret } from "../lib/auth"
import { assertDiscordSnowflake } from "../lib/discordId"

export const record = action({
  args: {
    secret: v.string(),
    event: discordGuildEventRecordInput,
  },
  returns: v.object({
    id: v.id("discordGuildEvents"),
    deduplicated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    assertDiscordSnowflake("discordGuildId", args.event.discordGuildId)

    return await ctx.runMutation(
      internal.mutations.bot.discord.guildEvents.record.record,
      {
        event: args.event,
      }
    )
  },
})
