import { formatDiscordGuildEventType } from "@workspace/shared/discordGuildEventLabels"
import { v } from "convex/values"

import type { Doc } from "../../../_generated/dataModel"
import { query } from "../../../_generated/server"
import { getCurrentUser } from "../../../lib/auth"
import { getStaffDiscordMetrics } from "../../../lib/staffDiscordMetrics"

const staffAccessResult = v.object({
  status: v.union(v.literal("forbidden"), v.literal("ready")),
})

const staffOverviewActivity = v.object({
  id: v.string(),
  eventType: v.string(),
  summary: v.string(),
  discordGuildId: v.string(),
  guildName: v.string(),
  occurredAt: v.number(),
})

const staffOverviewResult = v.union(
  v.object({ status: v.literal("forbidden") }),
  v.object({
    status: v.literal("ready"),
    metrics: v.object({
      guildCount: v.number(),
      userCount: v.number(),
    }),
    activity: v.array(staffOverviewActivity),
  })
)

type StaffActivity = {
  id: string
  eventType: string
  summary: string
  discordGuildId: string
  guildName: string
  occurredAt: number
}

export const get = query({
  args: {},
  returns: staffAccessResult,
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const ready = hasStaffAccess(user)

    return {
      status: ready ? ("ready" as const) : ("forbidden" as const),
    }
  },
})

export const overview = query({
  args: {},
  returns: staffOverviewResult,
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!hasStaffAccess(user)) {
      return { status: "forbidden" as const }
    }

    const [metrics, recentGuildEvents, recentJoinedGuilds, recentLeftGuilds] =
      await Promise.all([
        getStaffDiscordMetrics(ctx),
        ctx.db
          .query("discordGuildEvents")
          .withIndex("by_occurred_at")
          .order("desc")
          .take(100),
        ctx.db
          .query("guilds")
          .withIndex("by_bot_joined_at")
          .order("desc")
          .take(50),
        ctx.db
          .query("guilds")
          .withIndex("by_bot_left_at")
          .order("desc")
          .take(50),
      ])

    const eventGuildIds = Array.from(
      new Set(recentGuildEvents.map((event) => event.discordGuildId))
    )
    const eventGuilds = await Promise.all(
      eventGuildIds.map(async (discordGuildId) => {
        return await ctx.db
          .query("guilds")
          .withIndex("by_discord_guild_id", (q) =>
            q.eq("discordGuildId", discordGuildId)
          )
          .unique()
      })
    )
    const guildByDiscordId = new Map(
      eventGuilds
        .filter((guild): guild is Doc<"guilds"> => guild !== null)
        .map((guild) => [guild.discordGuildId, guild] as const)
    )

    const activity: StaffActivity[] = [
      ...recentGuildEvents.map((event) => ({
        id: `event:${event._id}`,
        eventType: event.eventType,
        summary: formatDiscordGuildEventType(event.eventType),
        discordGuildId: event.discordGuildId,
        guildName:
          guildByDiscordId.get(event.discordGuildId)?.name ?? "Unknown server",
        occurredAt: event.occurredAt,
      })),
      ...recentJoinedGuilds.flatMap((guild) =>
        guild.botJoinedAt === undefined
          ? []
          : [
              {
                id: `guild:${guild.discordGuildId}:joined:${guild.botJoinedAt}`,
                eventType: "botGuildJoin",
                summary: "Cleo joined the server",
                discordGuildId: guild.discordGuildId,
                guildName: guild.name,
                occurredAt: guild.botJoinedAt,
              },
            ]
      ),
      ...recentLeftGuilds.flatMap((guild) =>
        guild.botLeftAt === undefined
          ? []
          : [
              {
                id: `guild:${guild.discordGuildId}:left:${guild.botLeftAt}`,
                eventType: "botGuildLeave",
                summary: "Cleo left the server",
                discordGuildId: guild.discordGuildId,
                guildName: guild.name,
                occurredAt: guild.botLeftAt,
              },
            ]
      ),
    ]
      .sort((left, right) => right.occurredAt - left.occurredAt)
      .slice(0, 100)

    return {
      status: "ready" as const,
      metrics: {
        guildCount: metrics?.activeGuildCount ?? 0,
        userCount: metrics?.memberCount ?? 0,
      },
      activity,
    }
  },
})

export function hasStaffAccess(
  user: Pick<Doc<"users">, "role" | "status"> | null
): boolean {
  return Boolean(
    user &&
      user.status !== "disabled" &&
      ["staff", "admin", "superadmin"].includes(user.role)
  )
}
