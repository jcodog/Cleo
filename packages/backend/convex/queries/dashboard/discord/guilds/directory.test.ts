import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import schema from "../../../../schema"
import { api } from "../../../../_generated/api"

test("directory retains only same-account metadata during verification gaps while protected lists fail closed", async (t) => {
  let now = 1000000
  t.mock.method(Date, "now", () => now)
  const db = convexTest({
    schema,
    modules: {
      "./_generated/server.js": () =>
        import("../../../../_generated/server.js"),
      "./queries/dashboard/discord/guilds/directory.ts": () =>
        import("./directory"),
      "./queries/dashboard/discord/guilds/manageable.ts": () =>
        import("./manageable"),
    },
  })
  const ids = await db.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "one",
      role: "user",
      email: "one@example.com",
      createdAt: 1,
      updatedAt: 1,
    })
    const accountId = await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId: "111111111111111111",
      scopes: [],
      createdAt: 1,
      updatedAt: 1,
    })
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId: "222222222222222222",
      name: "My server",
      botJoinedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const membershipId = await ctx.db.insert("discordGuildMemberships", {
      userId,
      guildId,
      discordUserId: "111111111111111111",
      canManage: true,
      managementVerifiedAt: now,
      createdAt: 1,
      updatedAt: 1,
    })
    const refreshId = await ctx.db.insert("discordGuildRefreshes", {
      userId,
      discordUserId: "111111111111111111",
      linkedAccountId: accountId,
      revision: 1,
      startedAt: now,
      state: "complete",
      guilds: [],
      phase: "incoming",
      offset: 0,
      reconciliation: false,
    })
    return { userId, accountId, guildId, membershipId, refreshId }
  })
  const user = db.withIdentity({ subject: "one" })
  const directory = () =>
    user.query(api.queries.dashboard.discord.guilds.directory.list, {})
  const manageable = () =>
    user.query(api.queries.dashboard.discord.guilds.manageable.list, {})
  assert.equal((await directory()).guilds[0]?.verified, true)
  await db.run((ctx) => ctx.db.patch(ids.refreshId, { state: "pending" }))
  assert.equal((await directory()).status, "pending")
  assert.equal((await directory()).guilds[0]?.name, "My server")
  assert.deepEqual(await manageable(), [])
  await db.run((ctx) => ctx.db.patch(ids.refreshId, { state: "failed" }))
  assert.equal((await directory()).status, "unavailable")
  await db.run((ctx) => ctx.db.patch(ids.refreshId, { state: "complete" }))
  now += 300001
  assert.equal((await directory()).status, "expired")
  assert.equal((await directory()).guilds[0]?.verified, false)
  assert.deepEqual(await manageable(), [])
  await db.run((ctx) =>
    ctx.db.patch(ids.membershipId, { revokedAt: now, canManage: false })
  )
  assert.deepEqual((await directory()).guilds, [])
  await db.run((ctx) =>
    ctx.db.patch(ids.membershipId, { revokedAt: undefined, canManage: true })
  )
  await db.run((ctx) => ctx.db.patch(ids.guildId, { botLeftAt: now }))
  assert.deepEqual((await directory()).guilds, [])
  await db.run((ctx) => ctx.db.patch(ids.guildId, { botLeftAt: undefined }))
  await db.run((ctx) =>
    ctx.db.patch(ids.accountId, { providerAccountId: "333333333333333333" })
  )
  assert.deepEqual((await directory()).guilds, [])
  assert.deepEqual(
    (
      await db
        .withIdentity({ subject: "other" })
        .query(api.queries.dashboard.discord.guilds.directory.list, {})
    ).guilds,
    []
  )
  await db.run((ctx) => ctx.db.delete(ids.accountId))
  assert.equal((await directory()).status, "missingDiscord")
})
