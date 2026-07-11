import type { Doc, Id } from "../../../../_generated/dataModel"
import {
  internalMutation,
  type MutationCtx,
} from "../../../../_generated/server"
import {
  buildActiveSupportTicketKey,
  getGuildSupportUnavailableReason,
  normalizeSupportTicketInput,
  openSupportTicketInput,
  openSupportTicketResult,
  type GuildSupportConfigForRouting,
} from "../../../../lib/supportTickets"

export const openOrResume = internalMutation({
  args: openSupportTicketInput,
  returns: openSupportTicketResult,
  handler: async (ctx, rawInput) => {
    const input = normalizeSupportTicketInput(rawInput)
    const now = Date.now()
    const discordGuildId = input.discordGuildId
    const guild = discordGuildId
      ? await ctx.db
          .query("guilds")
          .withIndex("by_discord_guild_id", (q) =>
            q.eq("discordGuildId", discordGuildId)
          )
          .unique()
      : null
    const supportConfig = guild
      ? await ctx.db
          .query("guildSupportConfigs")
          .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
          .unique()
      : null

    if (input.discordGuildId) {
      if (!guild) {
        return {
          status: "guildSupportUnavailable" as const,
          reason: "unknownGuild" as const,
        }
      }

      if (guild.botLeftAt !== undefined) {
        return {
          status: "guildSupportUnavailable" as const,
          reason: "botLeft" as const,
        }
      }

      const unavailableReason = getGuildSupportUnavailableReason(supportConfig)

      if (unavailableReason) {
        return {
          status: "guildSupportUnavailable" as const,
          reason: unavailableReason,
        }
      }
    }

    const activeKey = buildActiveSupportTicketKey(input)
    const existingTicket = await ctx.db
      .query("supportTickets")
      .withIndex("by_active_key", (q) => q.eq("activeKey", activeKey))
      .unique()
    const requesterUserId = await findRequesterUserId(
      ctx,
      input.requesterDiscordUserId
    )
    const ticketId = existingTicket
      ? await resumeTicket(
          ctx,
          existingTicket,
          now,
          input.message !== undefined
        )
      : await createTicket({
          activeKey,
          ctx,
          guild,
          input,
          now,
          requesterUserId,
          supportConfig,
        })
    const transcriptPolicy =
      supportConfig?.transcriptPolicy ?? "explicit-messages"
    const messageStored =
      input.message !== undefined && transcriptPolicy === "explicit-messages"

    if (messageStored && input.message !== undefined) {
      await ctx.db.insert("supportTicketMessages", {
        ticketId,
        authorType: "requester",
        authorDiscordUserId: input.requesterDiscordUserId,
        body: input.message,
        createdAt: now,
      })
    }

    return {
      status: existingTicket ? ("resumed" as const) : ("opened" as const),
      ticketId,
      scope: input.discordGuildId ? ("guild" as const) : ("jcn" as const),
      ...(supportConfig?.targetId
        ? {
            route: {
              targetId: supportConfig.targetId,
              targetType: supportConfig.targetType,
              staffRoleIds: supportConfig.staffRoleIds,
              ...(existingTicket?.routingThreadId !== undefined
                ? { threadId: existingTicket.routingThreadId }
                : {}),
            },
          }
        : {}),
      ...(input.message !== undefined
        ? { submittedMessage: input.message }
        : {}),
      messageStored,
    }
  },
})

async function createTicket(args: {
  activeKey: string
  ctx: MutationCtx
  guild: Doc<"guilds"> | null
  input: ReturnType<typeof normalizeSupportTicketInput>
  now: number
  requesterUserId: Id<"users"> | null
  supportConfig: GuildSupportConfigForRouting | null
}): Promise<Id<"supportTickets">> {
  return await args.ctx.db.insert("supportTickets", {
    scope: args.input.discordGuildId ? "guild" : "jcn",
    status: "open",
    activeKey: args.activeKey,
    ...(args.requesterUserId ? { requesterUserId: args.requesterUserId } : {}),
    requesterDiscordUserId: args.input.requesterDiscordUserId,
    ...(args.guild
      ? {
          guildId: args.guild._id,
          discordGuildId: args.guild.discordGuildId,
        }
      : {}),
    ...(args.supportConfig?.targetId
      ? {
          routingTargetId: args.supportConfig.targetId,
          routingTargetType: args.supportConfig.targetType,
        }
      : {}),
    transcriptPolicy:
      args.supportConfig?.transcriptPolicy ?? "explicit-messages",
    escalationPolicy:
      args.supportConfig?.escalationPolicy ?? "jcn-product-only",
    source: "discord-help",
    openCount: 1,
    lastOpenedAt: args.now,
    lastActivityAt: args.now,
    createdAt: args.now,
    updatedAt: args.now,
  })
}

async function resumeTicket(
  ctx: MutationCtx,
  ticket: Doc<"supportTickets">,
  now: number,
  hasMessage: boolean
): Promise<Id<"supportTickets">> {
  const reopening = ticket.status === "resolved" || ticket.status === "closed"

  await ctx.db.patch(ticket._id, {
    status: "open",
    openCount: reopening ? ticket.openCount + 1 : ticket.openCount,
    lastOpenedAt: reopening ? now : ticket.lastOpenedAt,
    lastActivityAt: reopening || hasMessage ? now : ticket.lastActivityAt,
    resolvedAt: undefined,
    closedAt: undefined,
    updatedAt: now,
  })

  return ticket._id
}

async function findRequesterUserId(
  ctx: MutationCtx,
  requesterDiscordUserId: string
): Promise<Id<"users"> | null> {
  const linkedAccount = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_provider_and_provider_account_id", (q) =>
      q
        .eq("provider", "discord")
        .eq("providerAccountId", requesterDiscordUserId)
    )
    .unique()

  return linkedAccount?.userId ?? null
}
