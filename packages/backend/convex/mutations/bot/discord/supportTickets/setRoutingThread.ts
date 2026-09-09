import { v } from "convex/values"

import { internalMutation } from "../../../../_generated/server"
import { rejectSupportTicketOperation } from "../../../../lib/supportTickets"

export const set = internalMutation({
  args: {
    ticketId: v.id("supportTickets"),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async () => rejectSupportTicketOperation(),
})
