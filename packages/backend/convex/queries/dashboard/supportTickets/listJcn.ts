import { ConvexError, v } from "convex/values"

import { query } from "../../../_generated/server"
import { guildSupportEscalationPolicy } from "../../../dbTables/guildSupportConfigs"
import { supportTicketStatus } from "../../../dbTables/supportTickets"
import { requireStaff } from "../../../lib/auth"

const jcnSupportTicketViewModel = v.object({
  ticketId: v.id("supportTickets"),
  status: supportTicketStatus,
  requesterDiscordUserId: v.string(),
  escalationPolicy: guildSupportEscalationPolicy,
  openCount: v.number(),
  lastActivityAt: v.number(),
  createdAt: v.number(),
  latestMessage: v.optional(v.string()),
})

const jcnSupportTicketsResult = v.union(
  v.object({ status: v.literal("forbidden") }),
  v.object({
    status: v.literal("ready"),
    tickets: v.array(jcnSupportTicketViewModel),
  })
)

export const list = query({
  args: {},
  returns: jcnSupportTicketsResult,
  handler: async (ctx) => {
    try {
      await requireStaff(ctx)
    } catch (error) {
      if (error instanceof ConvexError) {
        return { status: "forbidden" as const }
      }

      throw error
    }

    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_scope_and_updated_at", (q) => q.eq("scope", "jcn"))
      .order("desc")
      .take(100)
    const ticketViews = await Promise.all(
      tickets.map(async (ticket) => {
        const latestMessage = await ctx.db
          .query("supportTicketMessages")
          .withIndex("by_ticket_id_and_created_at", (q) =>
            q.eq("ticketId", ticket._id)
          )
          .order("desc")
          .first()

        return {
          ticketId: ticket._id,
          status: ticket.status,
          requesterDiscordUserId: ticket.requesterDiscordUserId,
          escalationPolicy: ticket.escalationPolicy,
          openCount: ticket.openCount,
          lastActivityAt: ticket.lastActivityAt,
          createdAt: ticket.createdAt,
          ...(latestMessage ? { latestMessage: latestMessage.body } : {}),
        }
      })
    )

    return {
      status: "ready" as const,
      tickets: ticketViews,
    }
  },
})
