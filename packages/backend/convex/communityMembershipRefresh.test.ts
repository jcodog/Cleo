import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import { requireDiscordGuildManager } from "./lib/auth"

process.env.CLERK_SECRET_KEY = "fixture-clerk"
process.env.CLEO_OFFICIAL_GUILD_ID = "999999999999999999"
beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
afterEach(() => mock.timers.reset())
const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./communityRoles.ts": () => import("./communityRoles"),
  "./communityActions.ts": () => import("./communityActions"),
  "./queries/dashboard/discord/guilds/manageable.ts": () =>
    import("./queries/dashboard/discord/guilds/manageable"),
  "./queries/dashboard/discord/install/context.ts": () =>
    import("./queries/dashboard/discord/install/context"),
  "./actions/dashboard/discord/guilds/syncDashboardGuilds.ts": () =>
    import("./actions/dashboard/discord/guilds/syncDashboardGuilds"),
}

test("normal dashboard refresh restores expired evidence only after full current-identity verification", async (t) => {
  const f = await fixture()
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  await f.t.run((ctx) =>
    ctx.db.patch(f.guilds[0]!.membershipId, {
      managementVerifiedAt: Date.now() - 300001,
    })
  )
  await assert.rejects(f.access(), /Verified Discord guild management/)
  const previous = globalThis.fetch
  let mismatchedIdentity = false
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes("oauth_access_tokens")) {
      now += 10
      await f.t.run((ctx) => ctx.db.patch(f.accountId, { createdAt: now }))
      return Response.json([{ token: "fixture-oauth" }])
    }
    if (url.endsWith("/users/@me"))
      return Response.json({
        id: mismatchedIdentity ? "222222222222222222" : discordUserId,
      })
    return Response.json([
      {
        id: f.guilds[0]!.externalId,
        name: "Community",
        owner: true,
        permissions: "8",
      },
    ])
  }
  t.after(() => {
    globalThis.fetch = previous
  })
  const sync = api.actions.dashboard.discord.guilds.syncDashboardGuilds.sync
  assert.equal((await f.manager.action(sync, {})).status, "ready")
  await f.access()
  const evidence = await f.t.run((ctx) => ctx.db.get(f.guilds[0]!.membershipId))
  mismatchedIdentity = true
  assert.equal(
    (await f.manager.action(sync, {})).status,
    "discordGuildDiscoveryUnavailable"
  )
  assert.deepEqual(
    await f.t.run((ctx) => ctx.db.get(f.guilds[0]!.membershipId)),
    evidence
  )
})
const discordUserId = "111111111111111111"
async function fixture(count = 1) {
  const t = convexTest(schema, modules)
  const now = Date.now()
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "manager",
      email: "manager@example.com",
      role: "user",
      createdAt: now - 10000,
      updatedAt: now,
    })
    const accountId = await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId: discordUserId,
      scopes: [],
      createdAt: now - 10000,
      updatedAt: now,
    })
    const guilds = []
    for (let i = 0; i < count; i++) {
      const externalId = String(300000000000000000n + BigInt(i))
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: externalId,
        name: `Community ${i}`,
        ownerDiscordId: discordUserId,
        botInstallationVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      const membershipId = await ctx.db.insert("discordGuildMemberships", {
        guildId,
        userId,
        discordUserId,
        canManage: true,
        isOwner: true,
        permissions: "8",
        managementVerifiedAt: now - 1000,
        createdAt: now - 1000,
        updatedAt: now - 1000,
      })
      guilds.push({ guildId, membershipId, externalId })
    }
    return { userId, accountId, guilds }
  })
  const manager = t.withIdentity({ subject: "manager" })
  const state = () =>
    t.run((ctx) => ctx.db.query("discordGuildRefreshes").unique())
  const refresh = (
    guilds: { id: string; owner?: boolean; permissions?: string }[]
  ) =>
    t.mutation(internal.communityRoles.refreshGuilds, {
      userId: ids.userId,
      discordUserId,
      guilds,
    })
  async function drain() {
    for (let i = 0; i < 30; i++) {
      const row = await state()
      if (row?.state !== "pending") return
      await t.mutation(internal.communityRoles.continueGuildRefresh, {
        id: row._id,
        revision: row.revision,
      })
    }
    assert.fail("Refresh did not converge within bounded test batches")
  }
  return {
    t,
    ...ids,
    manager,
    state,
    refresh,
    drain,
    access: (guildId = ids.guilds[0]!.guildId) =>
      manager.run((ctx) => requireDiscordGuildManager(ctx, guildId)),
  }
}

test("delayed provider snapshots cannot overwrite newer permission revocation", async (t) => {
  const f = await fixture()
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  const update = (observedAt: number, permissions: string) =>
    f.t.mutation(internal.communityRoles.refreshGuilds, {
      userId: f.userId,
      discordUserId,
      observedAt,
      guilds: [{ id: f.guilds[0]!.externalId, owner: false, permissions }],
    })
  await update(now, "0")
  const latest = await f.state()
  await update(now - 1, "8")
  assert.deepEqual(await f.state(), latest)
  await assert.rejects(f.access(), /Verified Discord guild management/)
  await update(++now, "8")
  await f.access()
})

test("205 stored memberships reconcile past the first page and interrupted refreshes deny stale dashboard authority", async () => {
  const f = await fixture(205)
  const tail = f.guilds.at(-1)!
  await f.access(tail.guildId)
  await f.refresh([
    { id: f.guilds[0]!.externalId, owner: true, permissions: "8" },
  ])
  assert.equal((await f.state())?.state, "pending")
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(tail.membershipId)))?.revokedAt,
    undefined
  )
  await assert.rejects(
    f.access(tail.guildId),
    /Verified Discord guild management/
  )
  assert.deepEqual(
    await f.manager.query(
      api.queries.dashboard.discord.guilds.manageable.list,
      {}
    ),
    []
  )
  const checkpoint = (await f.state())!
  const { reconcileDiscordGuildRefresh } =
    await import("./lib/discordGuildRefresh")
  let gets = 0
  await f.t.run((ctx) =>
    reconcileDiscordGuildRefresh(
      {
        ...ctx,
        db: new Proxy(ctx.db, {
          get(db, property) {
            if (property === "get")
              return (...args: Parameters<typeof db.get>) => {
                gets++
                return db.get(...args)
              }
            return Reflect.get(db, property)
          },
        }),
      },
      checkpoint._id,
      checkpoint.revision
    )
  )
  assert.ok(
    gets <= 103,
    `A stored-membership batch performed ${gets} document reads`
  )
  await f.drain()
  assert.equal((await f.state())?.state, "complete")
  const revoked = await f.t.run((ctx) => ctx.db.get(tail.membershipId))
  assert.equal(revoked?.canManage, false)
  assert.equal(revoked?.isOwner, false)
  assert.ok(revoked?.revokedAt)
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(tail.guildId)))?.ownerDiscordId,
    undefined
  )
  await assert.rejects(
    f.access(tail.guildId),
    /Verified Discord guild management/
  )
  await f.access()
})

test("generation fencing, expiry and relinking cannot turn an unfinished refresh into authority", async (t) => {
  const f = await fixture(120)
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  const incoming = f.guilds.map(({ externalId }) => ({
    id: externalId,
    owner: true,
    permissions: "8",
  }))
  await f.refresh(incoming)
  const old = (await f.state())!
  now++
  await f.refresh(incoming)
  const latest = await f.state()
  await f.t.mutation(internal.communityRoles.continueGuildRefresh, {
    id: old._id,
    revision: old.revision,
  })
  assert.deepEqual(await f.state(), latest)
  await f.t.mutation(internal.communityRoles.continueGuildRefresh, {
    id: old._id,
    revision: latest!.revision,
  })
  assert.equal((await f.state())?.phase, "incoming")
  assert.equal((await f.state())?.offset, 50)
  await assert.rejects(f.access(), /Verified Discord guild management/)
  now += 300000
  await f.drain()
  assert.equal((await f.state())?.state, "failed")
  await assert.rejects(f.access(), /Verified Discord guild management/)
  await f.refresh(incoming)
  await f.t.run((ctx) =>
    ctx.db.patch(f.accountId, { providerAccountId: "222222222222222222" })
  )
  await f.drain()
  assert.equal((await f.state())?.state, "failed")
  await assert.rejects(f.access(), /Verified Discord guild management/)
})

test("fresh owners, Administrators and Manage Server users keep their intended access; loss, TTL and replaced identities revoke it", async (t) => {
  const f = await fixture()
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  for (const [owner, permissions, roleEligible] of [
    [true, "0", true],
    [false, "8", true],
    [false, "32", false],
  ] as const) {
    now++
    await f.refresh([{ id: f.guilds[0]!.externalId, owner, permissions }])
    await f.access()
    const roles = await f.manager.query(api.communityRoles.current, {})
    assert.equal(
      roles?.communityOwner === "eligible" ||
        roles?.communityManager === "eligible",
      roleEligible
    )
  }
  now++
  await f.refresh([
    { id: f.guilds[0]!.externalId, owner: false, permissions: "0" },
  ])
  await assert.rejects(f.access(), /Verified Discord guild management/)
  assert.equal(
    (await f.manager.query(api.communityRoles.current, {}))?.communityManager,
    "notEligible"
  )
  now++
  await f.refresh([
    { id: f.guilds[0]!.externalId, owner: false, permissions: "8" },
  ])
  now += 299999
  await f.access()
  now++
  await assert.rejects(f.access(), /Verified Discord guild management/)
  assert.notEqual(
    (await f.manager.query(api.communityRoles.current, {}))?.communityManager,
    "eligible"
  )
  await f.t.run((ctx) =>
    ctx.db.patch(f.guilds[0]!.membershipId, { managementVerifiedAt: now + 1 })
  )
  await assert.rejects(f.access(), /Verified Discord guild management/)
  await f.t.run((ctx) =>
    ctx.db.patch(f.accountId, { providerAccountId: "222222222222222222" })
  )
  await assert.rejects(f.access(), /Verified Discord guild management/)
  assert.deepEqual(
    await f.manager.query(
      api.queries.dashboard.discord.guilds.manageable.list,
      {}
    ),
    []
  )
})

for (const failure of ["provider", "duplicate", "bound"] as const)
  test(`failed Discord pagination (${failure}) never records a partial snapshot or renews authority`, async (t) => {
    const f = await fixture()
    const before = await f.t.run((ctx) => ctx.db.get(f.guilds[0]!.membershipId))
    let pages = 0
    const previous = globalThis.fetch
    globalThis.fetch = async (input) => {
      const url = String(input)
      if (url.includes("oauth_access_tokens"))
        return Response.json([{ token: "fixture-oauth" }])
      if (url.endsWith("/users/@me"))
        return Response.json({ id: discordUserId })
      pages++
      if (pages === 2 && failure === "provider")
        return new Response(null, { status: 503 })
      const offset = failure === "duplicate" ? 0 : (pages - 1) * 200
      return Response.json(
        Array.from({ length: 200 }, (_, i) => ({
          id: String(400000000000000000n + BigInt(offset + i)),
          owner: true,
          permissions: "8",
        }))
      )
    }
    t.after(() => {
      globalThis.fetch = previous
    })
    await assert.rejects(
      f.manager.action(api.communityActions.refreshEligibility, {}),
      /unavailable|pagination|supported bound/
    )
    assert.equal(await f.state(), null)
    assert.deepEqual(
      await f.t.run((ctx) => ctx.db.get(f.guilds[0]!.membershipId)),
      before
    )
    assert.equal(pages, failure === "bound" ? 5 : 2)
  })
