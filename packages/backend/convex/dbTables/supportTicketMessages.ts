import { defineTable } from "convex/server"
import { v } from "convex/values"

export const supportTicketMessages = defineTable({
  ticketId: v.id("supportTickets"),
  authorType: v.literal("requester"),
  authorDiscordUserId: v.string(),
  body: v.string(),
  createdAt: v.number(),
}).index("by_ticket_id_and_created_at", ["ticketId", "createdAt"])
