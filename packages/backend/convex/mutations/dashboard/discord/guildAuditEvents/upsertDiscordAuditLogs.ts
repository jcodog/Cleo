import { v } from "convex/values"

import type { Id } from "../../../../_generated/dataModel"
import { internalMutation } from "../../../../_generated/server"
import {
  insertDashboardGuildAuditEvent,
  insertGuildAuditEvent,
} from "../../../../lib/guildAudit"

const discordAuditLogEntry = v.object({
  discordAuditLogId: v.string(),
  actionType: v.number(),
  summary: v.string(),
  actorDiscordUserId: v.optional(v.string()),
  actorDisplayName: v.optional(v.string()),
  targetDiscordId: v.optional(v.string()),
  reason: v.optional(v.string()),
  changes: v.optional(v.array(v.any())),
  options: v.optional(v.any()),
  occurredAt: v.number(),
})

export const upsertMany = internalMutation({
  args: {
    guildId: v.id("guilds"),
    entries: v.array(discordAuditLogEntry),
  },
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const guild = await ctx.db.get(args.guildId)

    if (!guild) {
      return {
        inserted: 0,
        skipped: args.entries.length,
      }
    }

    let inserted = 0
    let skipped = 0

    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("guildAuditEvents")
        .withIndex("by_guild_id_and_external_id", (q) =>
          q.eq("guildId", guild._id).eq("externalId", entry.discordAuditLogId)
        )
        .unique()

      if (existing) {
        skipped += 1
        continue
      }

      await insertGuildAuditEvent(ctx, {
        guild,
        source: "discord-audit-log",
        eventType: `discord.audit_log.${entry.actionType}`,
        summary: entry.summary,
        ...(entry.actorDiscordUserId !== undefined
          ? { actorDiscordUserId: entry.actorDiscordUserId }
          : {}),
        ...(entry.actorDisplayName !== undefined
          ? { actorDisplayName: entry.actorDisplayName }
          : {}),
        ...(entry.targetDiscordId !== undefined
          ? { targetDiscordId: entry.targetDiscordId }
          : {}),
        targetType: "discord",
        externalId: entry.discordAuditLogId,
        metadata: {
          actionType: entry.actionType,
          reason: entry.reason ?? null,
          changes: entry.changes ?? null,
          options: entry.options ?? null,
        },
        occurredAt: entry.occurredAt,
      })
      inserted += 1
    }

    return {
      inserted,
      skipped,
    }
  },
})

export const createBotAction = internalMutation({
  args: {
    guildId: v.id("guilds"),
    eventType: v.string(),
    summary: v.string(),
    actorDiscordUserId: v.optional(v.string()),
    actorDisplayName: v.optional(v.string()),
    targetDiscordId: v.optional(v.string()),
    targetType: v.optional(v.string()),
    externalId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    occurredAt: v.optional(v.number()),
  },
  returns: v.id("guildAuditEvents"),
  handler: async (ctx, args): Promise<Id<"guildAuditEvents">> => {
    const guild = await ctx.db.get(args.guildId)

    if (!guild) {
      throw new Error("Guild not found.")
    }

    return await insertGuildAuditEvent(ctx, {
      guild,
      source: "bot-action",
      eventType: args.eventType,
      summary: args.summary,
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
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(args.occurredAt !== undefined ? { occurredAt: args.occurredAt } : {}),
    })
  },
})

export const createDashboardAction = internalMutation({
  args: {
    guildId: v.id("guilds"),
    userId: v.optional(v.id("users")),
    eventType: v.string(),
    summary: v.string(),
    metadata: v.optional(v.any()),
    occurredAt: v.optional(v.number()),
  },
  returns: v.id("guildAuditEvents"),
  handler: async (ctx, args): Promise<Id<"guildAuditEvents">> => {
    const guild = await ctx.db.get(args.guildId)
    const user =
      args.userId === undefined ? null : await ctx.db.get(args.userId)

    if (!guild) {
      throw new Error("Guild not found.")
    }

    return await insertDashboardGuildAuditEvent(ctx, {
      guild,
      user,
      eventType: args.eventType,
      summary: args.summary,
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(args.occurredAt !== undefined ? { occurredAt: args.occurredAt } : {}),
    })
  },
})
