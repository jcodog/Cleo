import { ConvexError, v, type Value } from "convex/values"

import type { Doc } from "../../../../_generated/dataModel"
import { query } from "../../../../_generated/server"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"
import { dashboardDiscordGuildAuditEventsResult } from "../../../../lib/validators"

const RETURN_LIMIT = 50

export const list = query({
  args: {
    discordGuildId: v.string(),
    source: v.optional(
      v.union(
        v.literal("dashboard"),
        v.literal("discord-audit-log"),
        v.literal("bot-action")
      )
    ),
  },
  returns: dashboardDiscordGuildAuditEventsResult,
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

    const membership = await getGuildManagerMembership(ctx, guild._id)

    if (!membership) {
      return { status: "forbidden" as const }
    }

    const events = await loadAuditEvents(ctx, guild, args.source)
    const syncState = await ctx.db
      .query("guildAuditLogSyncStates")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()

    return {
      status: "ready" as const,
      events: events.map((event) => ({
        auditEventId: event._id,
        source: event.source,
        eventType: event.eventType,
        summary: event.summary,
        details: getAuditEventDetails(event),
        ...(event.actorDiscordUserId !== undefined
          ? { actorDiscordUserId: event.actorDiscordUserId }
          : {}),
        ...(event.actorDisplayName !== undefined
          ? { actorDisplayName: event.actorDisplayName }
          : {}),
        ...(event.targetDiscordId !== undefined
          ? { targetDiscordId: event.targetDiscordId }
          : {}),
        ...(event.targetType !== undefined
          ? { targetType: event.targetType }
          : {}),
        ...(event.externalId !== undefined
          ? { externalId: event.externalId }
          : {}),
        occurredAt: event.occurredAt,
      })),
      syncState:
        syncState === null
          ? null
          : {
              syncStateId: syncState._id,
              ...(syncState.newestDiscordAuditLogId !== undefined
                ? {
                    newestDiscordAuditLogId:
                      syncState.newestDiscordAuditLogId,
                  }
                : {}),
              ...(syncState.newestOccurredAt !== undefined
                ? { newestOccurredAt: syncState.newestOccurredAt }
                : {}),
              ...(syncState.lastSyncedAt !== undefined
                ? { lastSyncedAt: syncState.lastSyncedAt }
                : {}),
              lastSyncStatus: syncState.lastSyncStatus,
              ...(syncState.lastSyncError !== undefined
                ? { lastSyncError: syncState.lastSyncError }
                : {}),
              updatedAt: syncState.updatedAt,
            },
    }
  },
})

async function loadAuditEvents(
  ctx: Parameters<typeof requireDiscordGuildManager>[0],
  guild: Doc<"guilds">,
  source: "dashboard" | "discord-audit-log" | "bot-action" | undefined
) {
  if (source === undefined) {
    return await ctx.db
      .query("guildAuditEvents")
      .withIndex("by_guild_id_and_occurred_at", (q) =>
        q.eq("guildId", guild._id)
      )
      .order("desc")
      .take(RETURN_LIMIT)
  }

  return await ctx.db
    .query("guildAuditEvents")
    .withIndex("by_guild_id_and_source_and_occurred_at", (q) =>
      q.eq("guildId", guild._id).eq("source", source)
    )
    .order("desc")
    .take(RETURN_LIMIT)
}

function getAuditEventDetails(event: Doc<"guildAuditEvents">): string[] {
  const metadata = event.metadata

  if (!isObjectRecord(metadata)) {
    return []
  }

  const details: string[] = []

  if (typeof metadata.reason === "string" && metadata.reason.length > 0) {
    details.push(`Reason: ${truncateDetail(metadata.reason)}`)
  }

  const changedFields = getChangedFields(metadata)

  if (changedFields.length > 0) {
    details.push(`Changed: ${changedFields.join(", ")}`)
  }

  const count = getOptionValue(metadata, "count")

  if (typeof count === "string" && count.length > 0) {
    details.push(`Count: ${count}`)
  }

  const channelId = getOptionValue(metadata, "channel_id")

  if (typeof channelId === "string" && channelId.length > 0) {
    details.push(`Channel: ${channelId}`)
  }

  return details.slice(0, 4)
}

function truncateDetail(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value
}

function getChangedFields(metadata: Record<string, unknown>): string[] {
  const changes = metadata.changes

  if (Array.isArray(changes)) {
    return changes.flatMap((change) => {
      if (
        isObjectRecord(change) &&
        typeof change.key === "string" &&
        change.key.length > 0
      ) {
        return [change.key]
      }

      return []
    })
  }

  const previous = metadata.previous
  const next = metadata.next

  if (!isObjectRecord(previous) || !isObjectRecord(next)) {
    return []
  }

  return Object.keys(next).filter((key) => previous[key] !== next[key])
}

function getOptionValue(
  metadata: Record<string, unknown>,
  key: string
): unknown {
  const options = metadata.options

  if (!isObjectRecord(options)) {
    return undefined
  }

  return options[key]
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function getGuildManagerMembership(
  ctx: Parameters<typeof requireDiscordGuildManager>[0],
  guildId: Doc<"guilds">["_id"]
): Promise<Doc<"discordGuildMemberships"> | null> {
  try {
    return await requireDiscordGuildManager(ctx, guildId)
  } catch (error) {
    if (error instanceof ConvexError) {
      const code = getConvexErrorCode(error)

      if (
        code === "FORBIDDEN" ||
        code === "UNAUTHORIZED" ||
        code === "USER_DISABLED"
      ) {
        return null
      }
    }

    throw error
  }
}

function getConvexErrorCode(error: ConvexError<Value>): string | undefined {
  const data: unknown = error.data

  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
  ) {
    return data.code
  }

  return undefined
}
