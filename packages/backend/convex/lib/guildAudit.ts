import { redactLogMetadata } from "@workspace/logger"

import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

type AuditSource = "dashboard" | "discord-audit-log" | "bot-action"

type InsertGuildAuditEventArgs = {
  guild: Doc<"guilds">
  source: AuditSource
  eventType: string
  summary: string
  actorUserId?: Id<"users">
  actorDiscordUserId?: string
  actorDisplayName?: string
  targetDiscordId?: string
  targetType?: string
  externalId?: string
  metadata?: unknown
  occurredAt?: number
}

type InsertDashboardGuildAuditEventArgs = {
  guild: Doc<"guilds">
  user: Doc<"users"> | null
  eventType: string
  summary: string
  metadata?: unknown
  occurredAt?: number
}

export async function insertGuildAuditEvent(
  ctx: MutationCtx,
  args: InsertGuildAuditEventArgs
): Promise<Id<"guildAuditEvents">> {
  const now = Date.now()

  return await ctx.db.insert("guildAuditEvents", {
    guildId: args.guild._id,
    discordGuildId: args.guild.discordGuildId,
    source: args.source,
    eventType: args.eventType,
    summary: args.summary,
    ...(args.actorUserId !== undefined ? { actorUserId: args.actorUserId } : {}),
    ...(args.actorDiscordUserId !== undefined
      ? { actorDiscordUserId: args.actorDiscordUserId }
      : {}),
    ...(args.actorDisplayName !== undefined
      ? { actorDisplayName: args.actorDisplayName }
      : {}),
    ...(args.targetDiscordId !== undefined
      ? { targetDiscordId: args.targetDiscordId }
      : {}),
    ...(args.targetType !== undefined ? { targetType: args.targetType } : {}),
    ...(args.externalId !== undefined ? { externalId: args.externalId } : {}),
    ...(args.metadata !== undefined
      ? { metadata: redactLogMetadata(args.metadata) }
      : {}),
    occurredAt: args.occurredAt ?? now,
    createdAt: now,
  })
}

export async function insertDashboardGuildAuditEvent(
  ctx: MutationCtx,
  args: InsertDashboardGuildAuditEventArgs
): Promise<Id<"guildAuditEvents">> {
  const discordAccount =
    args.user === null
      ? null
      : await getDiscordAccount(ctx, args.user)

  return await insertGuildAuditEvent(ctx, {
    guild: args.guild,
    source: "dashboard",
    eventType: args.eventType,
    summary: args.summary,
    ...(args.user !== null ? { actorUserId: args.user._id } : {}),
    ...(discordAccount?.providerAccountId !== undefined
      ? { actorDiscordUserId: discordAccount.providerAccountId }
      : {}),
    ...(args.user?.displayName !== undefined
      ? { actorDisplayName: args.user.displayName }
      : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    ...(args.occurredAt !== undefined ? { occurredAt: args.occurredAt } : {}),
  })
}

async function getDiscordAccount(ctx: MutationCtx, user: Doc<"users">) {
  return await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .filter((q) => q.eq(q.field("provider"), "discord"))
    .first()
}
