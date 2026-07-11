"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { discordModerationActionRecordInput } from "../../../../lib/discordModerationActions"
import { assertValidBotSecret } from "../lib/auth"
import { assertDiscordSnowflake } from "../lib/discordId"

export const record = action({
  args: {
    secret: v.string(),
    action: discordModerationActionRecordInput,
  },
  returns: v.object({
    id: v.id("discordModerationActions"),
    deduplicated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    assertDiscordSnowflake("discordGuildId", args.action.discordGuildId)

    return await ctx.runMutation(
      internal.mutations.bot.discord.moderationActions.record.record,
      {
        action: args.action,
      }
    )
  },
})
