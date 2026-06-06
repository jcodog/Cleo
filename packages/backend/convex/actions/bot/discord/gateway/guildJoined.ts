"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import { assertValidBotSecret } from "./lib/auth"
import { assertGatewayGuild, gatewayGuild } from "./lib/gatewayGuild"

export const sync = action({
  args: {
    secret: v.string(),
    guild: gatewayGuild,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    const syncedAt = Date.now()
    assertGatewayGuild(args.guild, syncedAt)

    const guildId = await ctx.runMutation(
      internal.mutations.bot.discord.guilds.upsertFromGateway.upsert,
      {
        ...args.guild,
        lastSyncedAt: syncedAt,
      }
    )

    await ctx.runMutation(
      internal.mutations.bot.discord.guildConfigs.ensure.forGuild,
      { guildId }
    )

    return null
  },
})
