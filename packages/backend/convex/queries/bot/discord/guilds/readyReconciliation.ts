import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"

import { internalQuery } from "../../../../_generated/server"

const reconciliationGuild = v.object({
  discordGuildId: v.string(),
  botLeftAt: v.optional(v.number()),
})

export const listPage = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(reconciliationGuild),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("guilds").paginate(args.paginationOpts)

    return {
      ...page,
      page: page.page.map((guild) => ({
        discordGuildId: guild.discordGuildId,
        ...(guild.botLeftAt !== undefined
          ? { botLeftAt: guild.botLeftAt }
          : {}),
      })),
    }
  },
})
