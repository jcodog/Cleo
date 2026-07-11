import { v, type Infer } from "convex/values"

import type { Doc } from "../../../../_generated/dataModel"
import { query } from "../../../../_generated/server"
import {
  discordBotRuntimeErrorServiceArea,
  discordBotRuntimeErrorSeverity,
} from "../../../../dbTables/discordBotRuntimeErrors"
import { isAppFeatureEnabledForUser } from "../../../../lib/appFeatureGates"
import { getCurrentUser } from "../../../../lib/auth"
import { jsonValue } from "../../../../lib/validators"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const FILTER_SCAN_LIMIT = 250

const runtimeIncidentListArgs = {
  severity: v.optional(discordBotRuntimeErrorSeverity),
  serviceArea: v.optional(discordBotRuntimeErrorServiceArea),
  guildId: v.optional(v.id("guilds")),
  discordGuildId: v.optional(v.string()),
  lastSeenAtFrom: v.optional(v.number()),
  lastSeenAtTo: v.optional(v.number()),
  limit: v.optional(v.number()),
}

const dashboardDiscordRuntimeIncidentViewModel = v.object({
  id: v.id("discordBotRuntimeErrors"),
  severity: discordBotRuntimeErrorSeverity,
  serviceArea: discordBotRuntimeErrorServiceArea,
  message: v.string(),
  guildId: v.optional(v.id("guilds")),
  discordGuildId: v.optional(v.string()),
  commandName: v.optional(v.string()),
  eventName: v.optional(v.string()),
  operation: v.optional(v.string()),
  fingerprint: v.string(),
  metadata: v.optional(jsonValue),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  occurrenceCount: v.number(),
})

const dashboardDiscordRuntimeIncidentsResult = v.union(
  v.object({ status: v.literal("forbidden") }),
  v.object({ status: v.literal("disabled") }),
  v.object({
    status: v.literal("ready"),
    incidents: v.array(dashboardDiscordRuntimeIncidentViewModel),
  })
)

export type RuntimeIncidentListArgs = {
  severity?: Doc<"discordBotRuntimeErrors">["severity"]
  serviceArea?: Doc<"discordBotRuntimeErrors">["serviceArea"]
  guildId?: Doc<"guilds">["_id"]
  discordGuildId?: string
  lastSeenAtFrom?: number
  lastSeenAtTo?: number
  limit?: number
}

export const list = query({
  args: runtimeIncidentListArgs,
  returns: dashboardDiscordRuntimeIncidentsResult,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!user || getRuntimeIncidentAccessStatus(user, false) === "forbidden") {
      return { status: "forbidden" as const }
    }

    const featureEnabled = await isAppFeatureEnabledForUser(
      ctx,
      "discordRuntimeIncidents",
      user
    )

    if (getRuntimeIncidentAccessStatus(user, featureEnabled) === "disabled") {
      return { status: "disabled" as const }
    }

    const incidents = await loadRuntimeIncidentDocs(ctx, args)

    return buildDashboardRuntimeIncidentsResult({
      args,
      featureEnabled,
      incidents,
      user,
    })
  },
})

export function getRuntimeIncidentAccessStatus(
  user: Pick<Doc<"users">, "role" | "status"> | null,
  featureEnabled: boolean
): "forbidden" | "disabled" | "ready" {
  if (
    !user ||
    user.status === "disabled" ||
    !["staff", "admin", "superadmin"].includes(user.role)
  ) {
    return "forbidden"
  }

  return featureEnabled ? "ready" : "disabled"
}

export function buildDashboardRuntimeIncidentsResult({
  args,
  featureEnabled,
  incidents,
  user,
}: {
  args: RuntimeIncidentListArgs
  featureEnabled: boolean
  incidents: Doc<"discordBotRuntimeErrors">[]
  user: Pick<Doc<"users">, "role" | "status"> | null
}): Infer<typeof dashboardDiscordRuntimeIncidentsResult> {
  const accessStatus = getRuntimeIncidentAccessStatus(user, featureEnabled)

  if (accessStatus !== "ready") {
    return { status: accessStatus }
  }

  const limit = normaliseIncidentLimit(args.limit)

  return {
    status: "ready",
    incidents: incidents
      .filter((incident) => matchesRuntimeIncidentFilters(incident, args))
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
      .slice(0, limit)
      .map(toDashboardRuntimeIncident),
  }
}

export function normaliseIncidentLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
}

async function loadRuntimeIncidentDocs(
  ctx: Parameters<typeof isAppFeatureEnabledForUser>[0],
  args: RuntimeIncidentListArgs
): Promise<Doc<"discordBotRuntimeErrors">[]> {
  if (args.severity !== undefined) {
    const severity = args.severity

    return await ctx.db
      .query("discordBotRuntimeErrors")
      .withIndex("by_severity_and_last_seen_at", (q) => {
        if (
          args.lastSeenAtFrom !== undefined &&
          args.lastSeenAtTo !== undefined
        ) {
          return q
            .eq("severity", severity)
            .gte("lastSeenAt", args.lastSeenAtFrom)
            .lte("lastSeenAt", args.lastSeenAtTo)
        }
        if (args.lastSeenAtFrom !== undefined) {
          return q
            .eq("severity", severity)
            .gte("lastSeenAt", args.lastSeenAtFrom)
        }
        if (args.lastSeenAtTo !== undefined) {
          return q.eq("severity", severity).lte("lastSeenAt", args.lastSeenAtTo)
        }
        return q.eq("severity", severity)
      })
      .order("desc")
      .take(FILTER_SCAN_LIMIT)
  }

  if (args.serviceArea !== undefined) {
    const serviceArea = args.serviceArea

    return await ctx.db
      .query("discordBotRuntimeErrors")
      .withIndex("by_service_area_and_last_seen_at", (q) => {
        if (
          args.lastSeenAtFrom !== undefined &&
          args.lastSeenAtTo !== undefined
        ) {
          return q
            .eq("serviceArea", serviceArea)
            .gte("lastSeenAt", args.lastSeenAtFrom)
            .lte("lastSeenAt", args.lastSeenAtTo)
        }
        if (args.lastSeenAtFrom !== undefined) {
          return q
            .eq("serviceArea", serviceArea)
            .gte("lastSeenAt", args.lastSeenAtFrom)
        }
        if (args.lastSeenAtTo !== undefined) {
          return q
            .eq("serviceArea", serviceArea)
            .lte("lastSeenAt", args.lastSeenAtTo)
        }
        return q.eq("serviceArea", serviceArea)
      })
      .order("desc")
      .take(FILTER_SCAN_LIMIT)
  }

  if (args.guildId !== undefined) {
    return await ctx.db
      .query("discordBotRuntimeErrors")
      .withIndex("by_guild_id_and_last_seen_at", (q) => {
        if (
          args.lastSeenAtFrom !== undefined &&
          args.lastSeenAtTo !== undefined
        ) {
          return q
            .eq("guildId", args.guildId)
            .gte("lastSeenAt", args.lastSeenAtFrom)
            .lte("lastSeenAt", args.lastSeenAtTo)
        }
        if (args.lastSeenAtFrom !== undefined) {
          return q
            .eq("guildId", args.guildId)
            .gte("lastSeenAt", args.lastSeenAtFrom)
        }
        if (args.lastSeenAtTo !== undefined) {
          return q
            .eq("guildId", args.guildId)
            .lte("lastSeenAt", args.lastSeenAtTo)
        }
        return q.eq("guildId", args.guildId)
      })
      .order("desc")
      .take(FILTER_SCAN_LIMIT)
  }

  if (args.discordGuildId !== undefined) {
    return await ctx.db
      .query("discordBotRuntimeErrors")
      .withIndex("by_discord_guild_id_and_last_seen_at", (q) => {
        if (
          args.lastSeenAtFrom !== undefined &&
          args.lastSeenAtTo !== undefined
        ) {
          return q
            .eq("discordGuildId", args.discordGuildId)
            .gte("lastSeenAt", args.lastSeenAtFrom)
            .lte("lastSeenAt", args.lastSeenAtTo)
        }
        if (args.lastSeenAtFrom !== undefined) {
          return q
            .eq("discordGuildId", args.discordGuildId)
            .gte("lastSeenAt", args.lastSeenAtFrom)
        }
        if (args.lastSeenAtTo !== undefined) {
          return q
            .eq("discordGuildId", args.discordGuildId)
            .lte("lastSeenAt", args.lastSeenAtTo)
        }
        return q.eq("discordGuildId", args.discordGuildId)
      })
      .order("desc")
      .take(FILTER_SCAN_LIMIT)
  }

  return await ctx.db
    .query("discordBotRuntimeErrors")
    .withIndex("by_last_seen_at", (q) => {
      if (
        args.lastSeenAtFrom !== undefined &&
        args.lastSeenAtTo !== undefined
      ) {
        return q
          .gte("lastSeenAt", args.lastSeenAtFrom)
          .lte("lastSeenAt", args.lastSeenAtTo)
      }
      if (args.lastSeenAtFrom !== undefined) {
        return q.gte("lastSeenAt", args.lastSeenAtFrom)
      }
      if (args.lastSeenAtTo !== undefined) {
        return q.lte("lastSeenAt", args.lastSeenAtTo)
      }
      return q
    })
    .order("desc")
    .take(FILTER_SCAN_LIMIT)
}

function matchesRuntimeIncidentFilters(
  incident: Doc<"discordBotRuntimeErrors">,
  args: RuntimeIncidentListArgs
): boolean {
  return (
    (args.severity === undefined || incident.severity === args.severity) &&
    (args.serviceArea === undefined ||
      incident.serviceArea === args.serviceArea) &&
    (args.guildId === undefined || incident.guildId === args.guildId) &&
    (args.discordGuildId === undefined ||
      incident.discordGuildId === args.discordGuildId) &&
    (args.lastSeenAtFrom === undefined ||
      incident.lastSeenAt >= args.lastSeenAtFrom) &&
    (args.lastSeenAtTo === undefined ||
      incident.lastSeenAt <= args.lastSeenAtTo)
  )
}

function toDashboardRuntimeIncident(
  incident: Doc<"discordBotRuntimeErrors">
): Infer<typeof dashboardDiscordRuntimeIncidentViewModel> {
  return {
    id: incident._id,
    severity: incident.severity,
    serviceArea: incident.serviceArea,
    message: incident.message,
    ...(incident.guildId !== undefined ? { guildId: incident.guildId } : {}),
    ...(incident.discordGuildId !== undefined
      ? { discordGuildId: incident.discordGuildId }
      : {}),
    ...(incident.commandName !== undefined
      ? { commandName: incident.commandName }
      : {}),
    ...(incident.eventName !== undefined
      ? { eventName: incident.eventName }
      : {}),
    ...(incident.operation !== undefined
      ? { operation: incident.operation }
      : {}),
    fingerprint: incident.fingerprint,
    ...(incident.metadata !== undefined ? { metadata: incident.metadata } : {}),
    firstSeenAt: incident.firstSeenAt,
    lastSeenAt: incident.lastSeenAt,
    occurrenceCount: incident.occurrenceCount,
  }
}
