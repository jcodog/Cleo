"use node"

import { v } from "convex/values"

import { action } from "../../../../_generated/server"
import { rejectSupportTicketOperation } from "../../../../lib/supportTickets"
import { assertValidBotSecret } from "../lib/auth"

export const set = action({
  args: {
    secret: v.string(),
    ticketId: v.id("supportTickets"),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    assertValidBotSecret(args.secret)
    return rejectSupportTicketOperation()
  },
})
