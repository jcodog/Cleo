import { v } from "convex/values"

import { internalMutation } from "../../../../_generated/server"

export const set = internalMutation({
  args: {
    ticketId: v.id("supportTickets"),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId)

    if (!ticket || ticket.routingTargetType !== "forum") {
      return null
    }

    await ctx.db.patch(ticket._id, {
      routingThreadId: args.threadId,
      updatedAt: Date.now(),
    })
    return null
  },
})
