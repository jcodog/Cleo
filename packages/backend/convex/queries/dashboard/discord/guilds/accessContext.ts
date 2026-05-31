import { ConvexError, v, type Value } from "convex/values"

import type { Doc } from "../../../../_generated/dataModel"
import { internalQuery } from "../../../../_generated/server"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"
import { guildDoc } from "../../../../lib/validators"

const managedGuildContext = v.union(
  v.object({
    status: v.literal("missingUser"),
  }),
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("ready"),
    guild: guildDoc,
  })
)

export const getManagedGuildContext = internalQuery({
  args: {
    discordGuildId: v.string(),
  },
  returns: managedGuildContext,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!user || user.status === "disabled") {
      return { status: "missingUser" as const }
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

    return {
      status: "ready" as const,
      guild,
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
