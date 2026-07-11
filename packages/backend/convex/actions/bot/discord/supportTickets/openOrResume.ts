"use node"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { v } from "convex/values"
import {
  openSupportTicketInput,
  openSupportTicketResult,
} from "../../../../lib/supportTickets"
import { assertValidBotSecret } from "../lib/auth"

export const openOrResume = action({
  args: {
    secret: v.string(),
    input: openSupportTicketInput,
  },
  returns: openSupportTicketResult,
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)

    return await ctx.runMutation(
      internal.mutations.bot.discord.supportTickets.openOrResume.openOrResume,
      args.input
    )
  },
})
