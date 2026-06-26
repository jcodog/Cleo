import { ConvexError, v, type Value } from "convex/values"

import type { Doc } from "../../../../_generated/dataModel"
import { query } from "../../../../_generated/server"
import {
  discordModerationActionResult,
  discordModerationActionType,
} from "../../../../lib/discordModerationActions"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"

const RETURN_LIMIT = 25

const moderationActionViewModel = v.object({
  moderationActionId: v.id("discordModerationActions"),
  actionType: discordModerationActionType,
  actorDiscordUserId: v.string(),
  targetDiscordUserId: v.string(),
  reason: v.optional(v.string()),
  result: discordModerationActionResult,
  failureCode: v.optional(v.string()),
  occurredAt: v.number(),
})

const moderationActionsResult = v.union(
  v.object({ status: v.literal("notFound") }),
  v.object({ status: v.literal("forbidden") }),
  v.object({
    status: v.literal("ready"),
    actions: v.array(moderationActionViewModel),
  })
)

export const list = query({
  args: {
    discordGuildId: v.string(),
  },
  returns: moderationActionsResult,
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

    const actions = await ctx.db
      .query("discordModerationActions")
      .withIndex("by_guild_id_and_occurred_at", (q) =>
        q.eq("guildId", guild._id)
      )
      .order("desc")
      .take(RETURN_LIMIT)

    return {
      status: "ready" as const,
      actions: actions.map(toViewModel),
    }
  },
})

function toViewModel(action: Doc<"discordModerationActions">) {
  return {
    moderationActionId: action._id,
    actionType: action.actionType,
    actorDiscordUserId: action.actorDiscordUserId,
    targetDiscordUserId: action.targetDiscordUserId,
    ...(action.reason !== undefined ? { reason: action.reason } : {}),
    result: action.result,
    ...(action.failureCode !== undefined
      ? { failureCode: action.failureCode }
      : {}),
    occurredAt: action.occurredAt,
  }
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
