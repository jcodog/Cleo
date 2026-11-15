import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { api } from "../../../../_generated/api"
import schema from "../../../../schema"

const modules = {
  "./queries/dashboard/discord/guilds/directory.ts": () =>
    import("./directory"),
  "./_generated/server.js": () => import("../../../../_generated/server.js"),
  "./mutations/dashboard/discord/guilds/markOpened.ts": () =>
    import("../../../../mutations/dashboard/discord/guilds/markOpened"),
  "./queries/dashboard/discord/guilds/manageable.ts": () =>
    import("./manageable"),
}

test("guild recency belongs to each manager's verified membership", async (t) => {
  const convex = convexTest({ schema, modules })
  const now = Date.now()
  let clock = now
  t.mock.method(Date, "now", () => clock)
  const firstClerkUserId = "clerk_first_manager"
  const secondClerkUserId = "clerk_second_manager"

  const { firstMembershipId, guildId, secondMembershipId } = await convex.run(
    async (ctx) => {
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: "123456789012345678",
        name: "Shared guild",
        botJoinedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      const firstUserId = await ctx.db.insert("users", {
        clerkUserId: firstClerkUserId,
        email: "first@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      })
      const secondUserId = await ctx.db.insert("users", {
        clerkUserId: secondClerkUserId,
        email: "second@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      })
      for (const [userId, providerAccountId] of [
        [firstUserId, "223456789012345678"],
        [secondUserId, "323456789012345678"],
      ] as const)
        await ctx.db.insert("linkedAccounts", {
          userId,
          provider: "discord",
          providerAccountId,
          scopes: [],
          createdAt: now,
          updatedAt: now,
        })
      const firstMembershipId = await ctx.db.insert("discordGuildMemberships", {
        guildId,
        userId: firstUserId,
        discordUserId: "223456789012345678",
        canManage: true,
        managementVerifiedAt: now,
        lastOpenedAt: 100,
        createdAt: now,
        updatedAt: now,
      })
      const secondMembershipId = await ctx.db.insert(
        "discordGuildMemberships",
        {
          guildId,
          userId: secondUserId,
          discordUserId: "323456789012345678",
          canManage: true,
          managementVerifiedAt: now,
          lastOpenedAt: 200,
          createdAt: now,
          updatedAt: now,
        }
      )

      return { firstMembershipId, guildId, secondMembershipId }
    }
  )

  const firstGuilds = await convex
    .withIdentity({ subject: firstClerkUserId })
    .query(api.queries.dashboard.discord.guilds.manageable.list, {})
  const secondGuilds = await convex
    .withIdentity({ subject: secondClerkUserId })
    .query(api.queries.dashboard.discord.guilds.manageable.list, {})

  const directory = await convex
    .withIdentity({ subject: firstClerkUserId })
    .query(api.queries.dashboard.discord.guilds.directory.list, {})
  assert.equal(directory.clerkUserId, firstClerkUserId)
  assert.equal(directory.guilds[0]?.lastOpenedAt, 100)
  assert.equal(directory.guilds[0]?.verified, true)

  assert.equal(firstGuilds[0]?.lastOpenedAt, 100)
  assert.equal(secondGuilds[0]?.lastOpenedAt, 200)

  clock = now + 300
  await convex
    .withIdentity({ subject: firstClerkUserId })
    .mutation(api.mutations.dashboard.discord.guilds.markOpened.markOpened, {
      guildId,
    })

  const stored = await convex.run(async (ctx) => ({
    firstMembership: await ctx.db.get(firstMembershipId),
    guild: await ctx.db.get(guildId),
    secondMembership: await ctx.db.get(secondMembershipId),
  }))

  assert.equal(stored.firstMembership?.lastOpenedAt, now + 300)
  assert.equal(stored.secondMembership?.lastOpenedAt, 200)
  assert.equal(stored.guild?.lastOpenedAt, undefined)
})
