import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { internal } from "../../../../_generated/api"
import schema from "../../../../schema"

const modules = {
  "./_generated/server.js": () => import("../../../../_generated/server.js"),
  "./mutations/bot/discord/guilds/upsertFromGateway.ts": () =>
    import("./upsertFromGateway"),
}

const discordGuildId = "123456789012345678"

test("guild join upsert preserves omitted optional metadata", async () => {
  const t = convexTest({ schema, modules })
  const guildId = await t.run(async (ctx) =>
    await ctx.db.insert("guilds", {
      discordGuildId,
      name: "Cleo HQ",
      description: "Keep me",
      presenceCount: 42,
      botLeftAt: 1_500,
      lastSyncedAt: 1_500,
      createdAt: 1_000,
      updatedAt: 1_500,
    })
  )

  await t.mutation(
    internal.mutations.bot.discord.guilds.upsertFromGateway.upsert,
    {
      discordGuildId,
      name: "Cleo HQ",
      lastSyncedAt: 2_000,
    }
  )

  const guild = await t.run(async (ctx) => await ctx.db.get(guildId))

  assert.equal(guild?.description, "Keep me")
  assert.equal(guild?.presenceCount, 42)
  assert.equal(guild?.botLeftAt, undefined)
  assert.equal(guild?.lastSyncedAt, 2_000)
})

test("guild join upsert ignores stale snapshots", async () => {
  const t = convexTest({ schema, modules })
  const guildId = await t.run(async (ctx) =>
    await ctx.db.insert("guilds", {
      discordGuildId,
      name: "Current name",
      lastSyncedAt: 2_000,
      createdAt: 1_000,
      updatedAt: 2_000,
    })
  )

  await t.mutation(
    internal.mutations.bot.discord.guilds.upsertFromGateway.upsert,
    {
      discordGuildId,
      name: "Stale name",
      lastSyncedAt: 1_999,
    }
  )

  const guild = await t.run(async (ctx) => await ctx.db.get(guildId))
  assert.equal(guild?.name, "Current name")
})
