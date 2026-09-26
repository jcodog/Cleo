import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"

import { query } from "../../../_generated/server"
import { getCurrentUser } from "../../../lib/auth"
import { hasStaffAccess } from "./access"

const staffGuild = v.object({
  discordGuildId: v.string(),
  name: v.string(),
  memberCount: v.optional(v.number()),
  installedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
})

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(staffGuild),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!hasStaffAccess(user)) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      }
    }

    const result = await ctx.db
      .query("guilds")
      .withIndex("by_bot_left_at_and_member_count", (q) =>
        q.eq("botLeftAt", undefined)
      )
      .order("desc")
      .paginate(args.paginationOpts)

    return {
      ...result,
      page: result.page.map((guild) => ({
        discordGuildId: guild.discordGuildId,
        name: guild.name,
        ...(guild.memberCount !== undefined
          ? { memberCount: guild.memberCount }
          : {}),
        ...((guild.botJoinedAt ?? guild.botInstallationVerifiedAt) !== undefined
          ? {
              installedAt:
                guild.botJoinedAt ?? guild.botInstallationVerifiedAt,
            }
          : {}),
        ...(guild.lastSyncedAt !== undefined
          ? { lastSyncedAt: guild.lastSyncedAt }
          : {}),
      })),
    }
  },
})
