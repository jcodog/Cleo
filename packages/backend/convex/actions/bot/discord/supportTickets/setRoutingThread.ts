"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { assertValidBotSecret } from "../lib/auth"
import { assertDiscordSnowflake } from "../lib/discordId"

export const set = action({
  args: {
    secret: v.string(),
    ticketId: v.id("supportTickets"),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    assertDiscordSnowflake("threadId", args.threadId)
    await ctx.runMutation(
      internal.mutations.bot.discord.supportTickets.setRoutingThread.set,
      {
        ticketId: args.ticketId,
        threadId: args.threadId,
      }
    )
    return null
  },
})
