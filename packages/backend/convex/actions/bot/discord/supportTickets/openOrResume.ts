"use node"

import { action } from "../../../../_generated/server"
import { v } from "convex/values"
import {
  openSupportTicketInput,
  openSupportTicketResult,
  rejectSupportTicketOperation,
} from "../../../../lib/supportTickets"
import { assertValidBotSecret } from "../lib/auth"

export const openOrResume = action({
  args: {
    secret: v.string(),
    input: openSupportTicketInput,
  },
  returns: openSupportTicketResult,
  handler: async (_ctx, args) => {
    assertValidBotSecret(args.secret)

    return rejectSupportTicketOperation()
  },
})
