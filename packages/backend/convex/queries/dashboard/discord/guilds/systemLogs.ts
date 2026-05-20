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
        return await ctx.db
          .query("errorLogs")
          .withIndex("by_source_and_created_at", (q) => q.eq("source", source))
          .order("desc")
          .take(LOG_SOURCE_LIMIT)
      })
    )

    const logs = logsBySource
      .flat()
      .filter((log) => isGuildScopedLog(log, guild))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, LOG_RETURN_LIMIT)
      .map((log) => ({
        logId: log._id,
        source: log.source,
        level: log.level,
        message: log.message,
        ...(log.stack !== undefined ? { stack: log.stack } : {}),
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

function isGuildScopedLog(
  log: Doc<"errorLogs">,
  guild: Doc<"guilds">
): boolean {
  const metadata = log.metadata

  if (!isObjectRecord(metadata)) {
    return false
  }

  if (metadata.discordGuildId === guild.discordGuildId) {
    return true
  }

  if (metadata.guildId === guild._id) {
    return true
  }

  const guildMetadata = metadata.guild

  return (
    isObjectRecord(guildMetadata) &&
    (guildMetadata.discordGuildId === guild.discordGuildId ||
      guildMetadata.guildId === guild._id)
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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
