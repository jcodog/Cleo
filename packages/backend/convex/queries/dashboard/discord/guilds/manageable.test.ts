import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { api } from "../../../../_generated/api"
import schema from "../../../../schema"

const modules = {
  "./_generated/server.js": () => import("../../../../_generated/server.js"),
  "./mutations/dashboard/discord/guilds/markOpened.ts": () =>
    import("../../../../mutations/dashboard/discord/guilds/markOpened"),
  "./queries/dashboard/discord/guilds/manageable.ts": () =>
    import("./manageable"),
}

test("guild recency belongs to each manager's verified membership", async (t) => {
  const convex = convexTest({ schema, modules })
  const now = 1_800_000_000_000
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

  assert.equal(firstGuilds[0]?.lastOpenedAt, 100)
  assert.equal(secondGuilds[0]?.lastOpenedAt, 200)

  t.mock.method(Date, "now", () => 300)
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

  assert.equal(stored.firstMembership?.lastOpenedAt, 300)
  assert.equal(stored.secondMembership?.lastOpenedAt, 200)
  assert.equal(stored.guild?.lastOpenedAt, undefined)
})
