import { ConvexError, v, type Value } from "convex/values"
import type { Doc } from "../../../../_generated/dataModel"
import { query } from "../../../../_generated/server"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"
import { dashboardDiscordGuildSystemLogsResult } from "../../../../lib/validators"

const LOG_SOURCES = ["dashboard", "backend", "discord-bot"] as const
const LOG_SOURCE_LIMIT = 75
const LOG_RETURN_LIMIT = 25
const SAFE_LOG_MESSAGE = "Operational log details are hidden for this view."

export const list = query({
  args: {
    discordGuildId: v.string(),
  },
  returns: dashboardDiscordGuildSystemLogsResult,
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

    const logsBySource = await Promise.all(
      LOG_SOURCES.map(async (source) => {
        const [byGuildId, byDiscordGuildId] = await Promise.all([
          ctx.db
            .query("errorLogs")
            .withIndex("by_source_and_guild_id_and_created_at", (q) =>
              q.eq("source", source).eq("guildId", guild._id)
            )
            .order("desc")
            .take(LOG_SOURCE_LIMIT),
          ctx.db
            .query("errorLogs")
            .withIndex("by_source_and_discord_guild_id_and_created_at", (q) =>
              q.eq("source", source).eq("discordGuildId", guild.discordGuildId)
            )
            .order("desc")
            .take(LOG_SOURCE_LIMIT),
        ])

        return dedupeLogs([...byGuildId, ...byDiscordGuildId])
      })
    )

    const logs = logsBySource
      .flat()
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, LOG_RETURN_LIMIT)
      .map((log) => ({
        logId: log._id,
        source: log.source,
        level: log.level,
        message: SAFE_LOG_MESSAGE,
        createdAt: log.createdAt,
      }))

    return {
      status: "ready" as const,
      logs,
    }
  },
})

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

function dedupeLogs(logs: Doc<"errorLogs">[]): Doc<"errorLogs">[] {
  return Array.from(new Map(logs.map((log) => [log._id, log])).values())
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
