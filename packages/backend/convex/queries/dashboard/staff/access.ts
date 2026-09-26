import { v } from "convex/values"

import type { Doc } from "../../../_generated/dataModel"
import { query } from "../../../_generated/server"
import { getCurrentUser } from "../../../lib/auth"

const staffAccessResult = v.object({
  status: v.union(v.literal("forbidden"), v.literal("ready")),
})

const staffOverviewGuild = v.object({
  discordGuildId: v.string(),
  name: v.string(),
  memberCount: v.optional(v.number()),
  botJoinedAt: v.number(),
  lastSyncedAt: v.optional(v.number()),
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
      registeredAccountCount: v.number(),
    }),
    guilds: v.array(staffOverviewGuild),
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

type ActiveGuild = Doc<"guilds"> & {
  botJoinedAt: number
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

    const [users, guilds, recentGuildEvents] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("guilds").collect(),
      ctx.db
        .query("discordGuildEvents")
        .withIndex("by_occurred_at")
        .order("desc")
        .take(150),
    ])

    const activeGuilds = guilds.filter(isBotCurrentlyInGuild)
    const guildByDiscordId = new Map(
      guilds.map((guild) => [guild.discordGuildId, guild] as const)
    )

    const activity: StaffActivity[] = [
      ...recentGuildEvents.map((event) => ({
        id: `event:${event._id}`,
        eventType: event.eventType,
        summary: describeGuildEvent(event.eventType),
        discordGuildId: event.discordGuildId,
        guildName:
          guildByDiscordId.get(event.discordGuildId)?.name ?? "Unknown server",
        occurredAt: event.occurredAt,
      })),
      ...guilds.flatMap((guild) => buildGuildLifecycleActivity(guild)),
    ]
      .sort((left, right) => right.occurredAt - left.occurredAt)
      .slice(0, 100)

    return {
      status: "ready" as const,
      metrics: {
        guildCount: activeGuilds.length,
        userCount: activeGuilds.reduce(
          (total, guild) => total + (guild.memberCount ?? 0),
          0
        ),
        registeredAccountCount: users.filter(
          (registeredUser) => registeredUser.status !== "disabled"
        ).length,
      },
      guilds: activeGuilds
        .sort((left, right) => {
          const memberDifference =
            (right.memberCount ?? 0) - (left.memberCount ?? 0)

          return memberDifference !== 0
            ? memberDifference
            : left.name.localeCompare(right.name)
        })
        .map((guild) => ({
          discordGuildId: guild.discordGuildId,
          name: guild.name,
          ...(guild.memberCount !== undefined
            ? { memberCount: guild.memberCount }
            : {}),
          botJoinedAt: guild.botJoinedAt,
          ...(guild.lastSyncedAt !== undefined
            ? { lastSyncedAt: guild.lastSyncedAt }
            : {}),
        })),
      activity,
    }
  },
})

function hasStaffAccess(
  user: Pick<Doc<"users">, "role" | "status"> | null
): boolean {
  return Boolean(
    user &&
      user.status !== "disabled" &&
      ["staff", "admin", "superadmin"].includes(user.role)
  )
}

function isBotCurrentlyInGuild(guild: Doc<"guilds">): guild is ActiveGuild {
  return Boolean(
    guild.botJoinedAt !== undefined &&
      (guild.botLeftAt === undefined || guild.botJoinedAt > guild.botLeftAt)
  )
}

function buildGuildLifecycleActivity(
  guild: Doc<"guilds">
): StaffActivity[] {
  const activity: StaffActivity[] = []

  if (guild.botJoinedAt !== undefined) {
    activity.push({
      id: `guild:${guild.discordGuildId}:joined:${guild.botJoinedAt}`,
      eventType: "botGuildJoin",
      summary: "Cleo joined the server",
      discordGuildId: guild.discordGuildId,
      guildName: guild.name,
      occurredAt: guild.botJoinedAt,
    })
  }

  if (guild.botLeftAt !== undefined) {
    activity.push({
      id: `guild:${guild.discordGuildId}:left:${guild.botLeftAt}`,
      eventType: "botGuildLeave",
      summary: "Cleo left the server",
      discordGuildId: guild.discordGuildId,
      guildName: guild.name,
      occurredAt: guild.botLeftAt,
    })
  }

  return activity
}

function describeGuildEvent(
  eventType: Doc<"discordGuildEvents">["eventType"]
): string {
  switch (eventType) {
    case "guildMemberAdd":
      return "Member joined"
    case "guildMemberRemove":
      return "Member left"
    case "guildBanAdd":
      return "Member banned"
    case "guildBanRemove":
      return "Member unbanned"
    case "channelCreate":
      return "Channel created"
    case "channelDelete":
      return "Channel deleted"
    case "roleCreate":
      return "Role created"
    case "roleDelete":
      return "Role deleted"
    case "messageDelete":
      return "Message deleted"
  }
}
