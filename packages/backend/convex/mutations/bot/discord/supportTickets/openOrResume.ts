import { internalMutation } from "../../../../_generated/server"
import {
  openSupportTicketInput,
  openSupportTicketResult,
  rejectSupportTicketOperation,
} from "../../../../lib/supportTickets"

export const openOrResume = internalMutation({
  args: openSupportTicketInput,
  returns: openSupportTicketResult,
  handler: async () => rejectSupportTicketOperation(),
})
