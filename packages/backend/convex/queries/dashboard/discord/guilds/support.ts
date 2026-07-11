import { ConvexError, v } from "convex/values"

import type { Doc } from "../../../../_generated/dataModel"
import { query } from "../../../../_generated/server"
import {
  guildSupportEscalationPolicy,
  guildSupportTargetType,
  guildSupportTranscriptPolicy,
} from "../../../../dbTables/guildSupportConfigs"
import { supportTicketStatus } from "../../../../dbTables/supportTickets"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"

const supportTicketViewModel = v.object({
  ticketId: v.id("supportTickets"),
  status: supportTicketStatus,
  requesterDiscordUserId: v.string(),
  transcriptPolicy: guildSupportTranscriptPolicy,
  escalationPolicy: guildSupportEscalationPolicy,
  openCount: v.number(),
  lastActivityAt: v.number(),
  createdAt: v.number(),
  latestMessage: v.optional(v.string()),
})

const guildSupportResult = v.union(
  v.object({ status: v.literal("notFound") }),
  v.object({ status: v.literal("forbidden") }),
  v.object({
    status: v.literal("ready"),
    config: v.union(
      v.null(),
      v.object({
        supportConfigId: v.id("guildSupportConfigs"),
        enabled: v.boolean(),
        staffRoleIds: v.array(v.string()),
        targetId: v.optional(v.string()),
        targetType: guildSupportTargetType,
        transcriptPolicy: guildSupportTranscriptPolicy,
        escalationPolicy: guildSupportEscalationPolicy,
        updatedAt: v.number(),
      })
    ),
    tickets: v.array(supportTicketViewModel),
  })
)

export const get = query({
  args: {
    discordGuildId: v.string(),
  },
  returns: guildSupportResult,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!user || user.status === "disabled") {
      return { status: "forbidden" as const }
    }

    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (!guild) {
      return { status: "notFound" as const }
    }

    if (!(await canManageGuild(ctx, guild._id))) {
      return { status: "forbidden" as const }
    }

    const [config, tickets] = await Promise.all([
      ctx.db
        .query("guildSupportConfigs")
        .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
        .unique(),
      ctx.db
        .query("supportTickets")
        .withIndex("by_guild_id_and_updated_at", (q) =>
          q.eq("guildId", guild._id)
        )
        .order("desc")
        .take(50),
    ])
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
          transcriptPolicy: ticket.transcriptPolicy,
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
      config:
        config === null
          ? null
          : {
              supportConfigId: config._id,
              enabled: config.enabled,
              staffRoleIds: config.staffRoleIds,
              ...(config.targetId ? { targetId: config.targetId } : {}),
              targetType: config.targetType,
              transcriptPolicy: config.transcriptPolicy,
              escalationPolicy: config.escalationPolicy,
              updatedAt: config.updatedAt,
            },
      tickets: ticketViews,
    }
  },
})

async function canManageGuild(
  ctx: Parameters<typeof requireDiscordGuildManager>[0],
  guildId: Doc<"guilds">["_id"]
): Promise<boolean> {
  try {
    await requireDiscordGuildManager(ctx, guildId)
    return true
  } catch (error) {
    if (error instanceof ConvexError) {
      const data: unknown = error.data

      if (
        typeof data === "object" &&
        data !== null &&
        "code" in data &&
        typeof data.code === "string" &&
        ["FORBIDDEN", "UNAUTHORIZED", "USER_DISABLED"].includes(data.code)
      ) {
        return false
      }
    }

    throw error
  }
}
