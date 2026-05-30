"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import type { Doc } from "../../../../_generated/dataModel"
import { action, type ActionCtx } from "../../../../_generated/server"
import {
  fetchDiscordGuildAuditLogs,
  type DiscordGuildAuditLogEntry,
} from "../../../../lib/discordRest"
import { dashboardDiscordAuditLogSyncResult } from "../../../../lib/validators"

const DISCORD_AUDIT_LOG_PAGE_SIZE = 100
const MAX_SYNC_PAGES = 5
const PAGE_LOAD_SYNC_COOLDOWN_MS = 60_000

export const sync = action({
  args: {
    discordGuildId: v.string(),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: dashboardDiscordAuditLogSyncResult,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.guilds.accessContext
        .getManagedGuildContext,
      { discordGuildId: args.discordGuildId }
    )

    if (context.status === "missingUser") {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    if (context.status === "notFound" || context.status === "forbidden") {
      return { status: context.status }
    }

    const result = await syncGuildAuditLogs(ctx, {
      force: args.force ?? false,
      guild: context.guild,
      limit: args.limit ?? DISCORD_AUDIT_LOG_PAGE_SIZE,
    })

    if (result.status === "pendingBotSync") {
      return {
        status: "pendingBotSync" as const,
        discordGuildId: context.guild.discordGuildId,
      }
    }

    if (result.status === "unavailable") {
      return {
        status: "auditLogSyncUnavailable" as const,
        reason: result.reason,
        discordGuildId: context.guild.discordGuildId,
      }
    }

    return {
      status: "ready" as const,
      discordGuildId: context.guild.discordGuildId,
      inserted: result.inserted,
      skipped: result.skipped,
      lastSyncedAt: result.lastSyncedAt,
      ...(result.newestDiscordAuditLogId !== undefined
        ? { newestDiscordAuditLogId: result.newestDiscordAuditLogId }
        : {}),
    }
  },
})

async function syncGuildAuditLogs(
  ctx: ActionCtx,
  {
    force,
    guild,
    limit,
  }: {
    force: boolean
    guild: Doc<"guilds">
    limit: number
  }
): Promise<
  | {
      status: "ready"
      inserted: number
      skipped: number
      lastSyncedAt: number
      newestDiscordAuditLogId?: string
    }
  | {
      status: "pendingBotSync"
    }
  | {
      status: "unavailable"
      reason: "discordBotTokenUnavailable" | "discordApiUnavailable"
    }
> {
  if (!isGuildRestInstalled(guild)) {
    await ctx.runMutation(
      internal.mutations.dashboard.discord.guildAuditLogSyncStates.upsert.upsert,
      {
        guildId: guild._id,
        status: "pendingBotSync",
      }
    )
    return { status: "pendingBotSync" }
  }

  if (!discordEnv.DISCORD_BOT_TOKEN) {
    await ctx.runMutation(
      internal.mutations.dashboard.discord.guildAuditLogSyncStates.upsert.upsert,
      {
        guildId: guild._id,
        status: "discordBotTokenUnavailable",
        lastSyncError: "Discord bot token is not configured.",
      }
    )
    return {
      status: "unavailable",
      reason: "discordBotTokenUnavailable",
    }
  }

  const syncState = await ctx.runQuery(
    internal.queries.dashboard.discord.guilds.auditSyncState.getByGuildId,
    { guildId: guild._id }
  )

  if (
    !force &&
    syncState?.lastSyncedAt !== undefined &&
    Date.now() - syncState.lastSyncedAt < PAGE_LOAD_SYNC_COOLDOWN_MS
  ) {
    return {
      status: "ready",
      inserted: 0,
      skipped: 0,
      lastSyncedAt: syncState.lastSyncedAt,
      ...(syncState.newestDiscordAuditLogId !== undefined
        ? { newestDiscordAuditLogId: syncState.newestDiscordAuditLogId }
        : {}),
    }
  }

  const entries = await fetchAuditLogPages({
    after: syncState?.newestDiscordAuditLogId,
    botToken: discordEnv.DISCORD_BOT_TOKEN,
    discordGuildId: guild.discordGuildId,
    limit,
  })

  if (!entries) {
    await ctx.runMutation(
      internal.mutations.dashboard.discord.guildAuditLogSyncStates.upsert.upsert,
      {
        guildId: guild._id,
        status: "discordApiUnavailable",
        lastSyncError:
          "Discord REST returned an unavailable or unexpected audit log response.",
      }
    )
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  const upsertResult = await ctx.runMutation(
    internal.mutations.dashboard.discord.guildAuditEvents.upsertDiscordAuditLogs
      .upsertMany,
    {
      guildId: guild._id,
      entries,
    }
  )
  const newestEntry = getNewestAuditLogEntry(entries)
  const lastSyncedAt = Date.now()

  await ctx.runMutation(
    internal.mutations.dashboard.discord.guildAuditLogSyncStates.upsert.upsert,
    {
      guildId: guild._id,
      status: "ready",
      ...(newestEntry !== null
        ? {
            newestDiscordAuditLogId: newestEntry.discordAuditLogId,
            newestOccurredAt: newestEntry.occurredAt,
          }
        : syncState?.newestDiscordAuditLogId !== undefined
          ? { newestDiscordAuditLogId: syncState.newestDiscordAuditLogId }
          : {}),
    }
  )

  return {
    status: "ready",
    inserted: upsertResult.inserted,
    skipped: upsertResult.skipped,
    lastSyncedAt,
    ...(newestEntry !== null
      ? { newestDiscordAuditLogId: newestEntry.discordAuditLogId }
      : syncState?.newestDiscordAuditLogId !== undefined
        ? { newestDiscordAuditLogId: syncState.newestDiscordAuditLogId }
        : {}),
  }
}

function isGuildRestInstalled(guild: Doc<"guilds">) {
  return (
    guild.botLeftAt === undefined &&
    (guild.botJoinedAt !== undefined ||
      guild.botInstallationVerifiedAt !== undefined)
  )
}

async function fetchAuditLogPages({
  after,
  botToken,
  discordGuildId,
  limit,
}: {
  after?: string
  botToken: string
  discordGuildId: string
  limit: number
}): Promise<DiscordGuildAuditLogEntry[] | null> {
  const safeLimit = Math.min(Math.max(limit, 1), DISCORD_AUDIT_LOG_PAGE_SIZE)
  const entries: DiscordGuildAuditLogEntry[] = []
  let cursorAfter = after
  let cursorBefore: string | undefined

  for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
    const pageEntries = await fetchDiscordGuildAuditLogs({
      after: cursorAfter,
      before: cursorAfter === undefined ? cursorBefore : undefined,
      botToken,
      discordGuildId,
      limit: safeLimit,
    })

    if (!pageEntries) {
      return null
    }

    entries.push(...pageEntries)

    if (pageEntries.length < safeLimit) {
      break
    }

    if (cursorAfter !== undefined) {
      cursorAfter = pageEntries[pageEntries.length - 1]?.discordAuditLogId
      continue
    }

    cursorBefore = pageEntries[pageEntries.length - 1]?.discordAuditLogId
  }

  return entries
}

function getNewestAuditLogEntry(
  entries: DiscordGuildAuditLogEntry[] | null
): DiscordGuildAuditLogEntry | null {
  if (!entries || entries.length === 0) {
    return null
  }

  const firstEntry = entries[0]

  if (firstEntry === undefined) {
    return null
  }

  return entries.reduce((newest, entry) => {
    return entry.occurredAt > newest.occurredAt ? entry : newest
  }, firstEntry)
}
