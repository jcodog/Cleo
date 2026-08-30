import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { api } from "../../../../_generated/api"
import schema from "../../../../schema"

process.env.DISCORD_BOT_CONVEX_SECRET = "test-bot-secret"

const modules = {
  "./_generated/server.js": () => import("../../../../_generated/server.js"),

  "./actions/bot/discord/gateway/guildJoined.ts": () => import("./guildJoined"),

  "./mutations/bot/discord/guilds/upsertFromGateway.ts": () =>
    import("../../../../mutations/bot/discord/guilds/upsertFromGateway"),

  "./mutations/bot/discord/guildConfigs/ensure.ts": () =>
    import("../../../../mutations/bot/discord/guildConfigs/ensure"),

  "./mutations/dashboard/discord/installSessions/upsert.ts": () =>
    import("../../../../mutations/dashboard/discord/installSessions/upsert"),
}

const discordGuildId = "123456789012345678"

test("guildJoined validates the bot secret, creates guild config, and marks an active install session as bot joined", async () => {
  const t = convexTest({ schema, modules })

  const installSessionId = await t.run(async (ctx) => {
    const now = Date.now()

    const userId = await ctx.db.insert("users", {
      clerkUserId: "clerk_test_user",
      email: "test@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })

    return await ctx.db.insert("discordGuildInstallSessions", {
      userId,
      discordUserId: "223456789012345678",
      discordGuildId,
      status: "pending",
      oauthState: "test-oauth-state",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    })
  })

  const input = {
    guild: {
      discordGuildId,
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

    const installSession = await ctx.db.get(installSessionId)

    return {
      guild,
      config,
      installSession,
    }
  })

  assert.equal(stored.guild?.name, "Cleo HQ")

  assert.equal(stored.config?.guildId, stored.guild?._id)

  assert.equal(stored.installSession?.status, "bot_joined")
})
