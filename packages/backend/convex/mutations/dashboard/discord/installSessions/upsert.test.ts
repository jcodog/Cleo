import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { internal } from "../../../../_generated/api"
import schema from "../../../../schema"

const modules = {
  "./_generated/server.js": () => import("../../../../_generated/server.js"),

  "./mutations/dashboard/discord/installSessions/upsert.ts": () =>
    import("./upsert"),
}

const discordGuildId = "123456789012345678"
const otherGuildId = "923456789012345678"

test("botJoined transitions only active pending sessions for the joined guild", async () => {
  const t = convexTest({ schema, modules })

  const sessions = await t.run(async (ctx) => {
    const now = Date.now()

    const userId = await ctx.db.insert("users", {
      clerkUserId: "clerk_test_user",
      email: "test@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })

    const active = await ctx.db.insert("discordGuildInstallSessions", {
      userId,
      discordUserId: "223456789012345678",
      discordGuildId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    })

    const expired = await ctx.db.insert("discordGuildInstallSessions", {
      userId,
      discordUserId: "223456789012345678",
      discordGuildId,
      status: "pending",
      createdAt: now - 10_000,
      updatedAt: now - 10_000,
      expiresAt: now - 1,
    })

    const alreadyJoined = await ctx.db.insert("discordGuildInstallSessions", {
      userId,
      discordUserId: "223456789012345678",
      discordGuildId,
      status: "bot_joined",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    })

    const otherGuild = await ctx.db.insert("discordGuildInstallSessions", {
      userId,
      discordUserId: "223456789012345678",
      discordGuildId: otherGuildId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    })

    return {
      active,
      expired,
      alreadyJoined,
      otherGuild,
    }
  })

  const updatedCount = await t.mutation(
    internal.mutations.dashboard.discord.installSessions.upsert.botJoined,
    {
      discordGuildId,
    }
  )

  assert.equal(updatedCount, 1)

  const stored = await t.run(async (ctx) => ({
    active: await ctx.db.get(sessions.active),
    expired: await ctx.db.get(sessions.expired),
    alreadyJoined: await ctx.db.get(sessions.alreadyJoined),
    otherGuild: await ctx.db.get(sessions.otherGuild),
  }))

  assert.equal(stored.active?.status, "bot_joined")

  assert.equal(stored.expired?.status, "pending")

  assert.equal(stored.alreadyJoined?.status, "bot_joined")

  assert.equal(stored.otherGuild?.status, "pending")
})

test("botJoined is idempotent after the pending session is transitioned", async () => {
  const t = convexTest({ schema, modules })

  await t.run(async (ctx) => {
    const now = Date.now()

    const userId = await ctx.db.insert("users", {
      clerkUserId: "clerk_test_user",
      email: "test@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("discordGuildInstallSessions", {
      userId,
      discordUserId: "223456789012345678",
      discordGuildId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    })
  })

  const first = await t.mutation(
    internal.mutations.dashboard.discord.installSessions.upsert.botJoined,
    { discordGuildId }
  )

  const second = await t.mutation(
    internal.mutations.dashboard.discord.installSessions.upsert.botJoined,
    { discordGuildId }
  )

  assert.equal(first, 1)
  assert.equal(second, 0)
})
