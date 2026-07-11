import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { api } from "../../../../_generated/api"
import schema from "../../../../schema"

process.env.DISCORD_BOT_CONVEX_SECRET = "test-bot-secret"

const modules = {
  "./_generated/server.js": () => import("../../../../_generated/server.js"),
  "./actions/bot/discord/gateway/guildJoined.ts": () =>
    import("./guildJoined"),
  "./mutations/bot/discord/guilds/upsertFromGateway.ts": () =>
    import("../../../../mutations/bot/discord/guilds/upsertFromGateway"),
  "./mutations/bot/discord/guildConfigs/ensure.ts": () =>
    import("../../../../mutations/bot/discord/guildConfigs/ensure"),
}

test("guildJoined validates the bot secret and creates guild config", async () => {
  const t = convexTest({ schema, modules })
  const input = {
    guild: {
      discordGuildId: "123456789012345678",
      name: "Cleo HQ",
      memberCount: 42,
    },
    syncedAt: 2_000,
  }

  await assert.rejects(
    t.action(api.actions.bot.discord.gateway.guildJoined.sync, {
      secret: "wrong",
      ...input,
    })
  )

  await t.action(api.actions.bot.discord.gateway.guildJoined.sync, {
    secret: "test-bot-secret",
    ...input,
  })

  const stored = await t.run(async (ctx) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", input.guild.discordGuildId)
      )
      .unique()
    const config = guild
      ? await ctx.db
          .query("guildConfigs")
          .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
          .unique()
      : null

    return { guild, config }
  })

  assert.equal(stored.guild?.name, "Cleo HQ")
  assert.equal(stored.config?.guildId, stored.guild?._id)
})
