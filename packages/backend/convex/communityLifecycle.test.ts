import assert from "node:assert/strict"
import { beforeEach, afterEach, mock, test, type TestContext } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { api, internal } from "./_generated/api"

process.env.CLEO_OFFICIAL_GUILD_ID = "999999999999999999"
process.env.CLEO_COMMUNITY_ROLES_ENABLED = "true"
process.env.CLEO_MANAGED_ROLE_IDS = "{}"
process.env.DISCORD_APPLICATION_ID = "777777777777777777"
process.env.DISCORD_CLIENT_SECRET = "fixture-client"
process.env.DISCORD_BOT_CONVEX_SECRET = "fixture-secret"
process.env.CLERK_SECRET_KEY = "fixture-clerk"
process.env.DISCORD_ROLE_CONNECTION_REDIRECT_URL =
  "https://dashboard.example/discord/linked-role"
process.env.DISCORD_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString(
  "base64"
)
beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
afterEach(() => mock.timers.reset())

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./communityRoles.ts": () => import("./communityRoles"),
  "./communityActions.ts": () => import("./communityActions"),
  "./communityRuntime.ts": () => import("./communityRuntime"),
  "./discordConnections.ts": () => import("./discordConnections"),
  "./communityRoleTesting.ts": () => import("./communityRoleTesting"),
  "./queries/dashboard/discord/install/context.ts": () =>
    import("./queries/dashboard/discord/install/context"),
  "./actions/dashboard/discord/install/listInstallableGuilds.ts": () =>
    import("./actions/dashboard/discord/install/listInstallableGuilds"),
}
const discordUserId = "111111111111111111"
async function fixture(
  t: TestContext,
  incomingCount: number,
  storedCount = incomingCount
) {
  const db = convexTest(schema, modules)
  const ids = await db.run(async (ctx) => {
    const now = Date.now()
    const userId = await ctx.db.insert("users", {
      clerkUserId: "alice",
      email: "alice@example.com",
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
    for (let i = 0; i < Math.max(incomingCount, storedCount); i++) {
      const externalId = String(300000000000000000n + BigInt(i))
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: externalId,
        name: `Community ${i}`,
        botInstallationVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      if (i < storedCount)
        await ctx.db.insert("discordGuildMemberships", {
          userId,
          discordUserId,
          guildId,
          isOwner: false,
          permissions: "8",
          canManage: true,
          managementVerifiedAt: now - 1000,
          createdAt: now,
          updatedAt: now,
        })
      guilds.push({
        id: externalId,
        owner: false,
        permissions: "8",
        name: `Community ${i}`,
      })
    }
    return { userId, accountId, guilds }
  })
  const { encryptDiscordTokens } = await import("./lib/integrationSecurity")
  await db.mutation(internal.discordConnections.storeTokens, {
    userId: ids.userId,
    discordUserId,
    encryptedTokens: encryptDiscordTokens(
      JSON.stringify({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
        scope: "identify role_connections.write",
      })
    ),
    expiresAt: Date.now() + 3600000,
  })
  const writes: Record<string, string>[] = []
  let guildRequests = 0
  let liveGuilds = ids.guilds.slice(0, incomingCount)
  let beforeGuilds: (() => Promise<void>) | undefined
  let beforePut: (() => Promise<void>) | undefined
  const previous = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes("oauth_access_tokens"))
      return Response.json([{ token: "fixture-oauth" }])
    if (url.endsWith("/oauth2/token/revoke") || init?.method === "DELETE")
      return new Response(null, { status: 204 })
    if (url.endsWith("/users/@me")) return Response.json({ id: discordUserId })
    if (url.includes("/users/@me/guilds")) {
      guildRequests++
      await beforeGuilds?.()
      const after = new URL(url).searchParams.get("after")
      const guilds = after
        ? liveGuilds.filter((guild) => BigInt(guild.id) > BigInt(after))
        : liveGuilds
      return Response.json(guilds.slice(0, 200))
    }
    if (init?.method === "PUT") {
      await beforePut?.()
      writes.push(JSON.parse(String(init.body)).metadata)
      return Response.json({})
    }
    throw new Error(`Unexpected fixture request: ${new URL(url).pathname}`)
  }
  t.after(() => {
    globalThis.fetch = previous
  })
  const alice = db.withIdentity({ subject: "alice" })
  return {
    db,
    alice,
    ...ids,
    guilds: ids.guilds.map(({ id, owner, permissions }) => ({
      id,
      owner,
      permissions,
    })),
    writes,
    requests: () => guildRequests,
    setGuilds: (guilds: typeof liveGuilds) => {
      liveGuilds = guilds
    },
    holdGuilds: (callback?: () => Promise<void>) => {
      beforeGuilds = callback
    },
    holdPut: (callback?: () => Promise<void>) => {
      beforePut = callback
    },
    status: () =>
      db.query(internal.communityRoles.refreshStatus, {
        userId: ids.userId,
        discordUserId,
      }),
    finish: () => db.finishAllScheduledFunctions(() => mock.timers.runAll()),
    claim: () =>
      db.action(api.communityRuntime.claimJobs, {
        secret: "fixture-secret",
        worker: "owner-shard",
      }),
  }
}

for (const count of [0, 1, 50, 51, 100, 101, 200, 205])
  test(`actual refresh, continuations and native publication converge once for ${count} guilds`, async (t) => {
    const f = await fixture(t, count)
    await f.alice.action(api.communityActions.refreshEligibility, {})
    const started = await f.status()
    assert.equal(started?.state, count > 50 ? "pending" : "complete")
    assert.equal(f.writes.length, 0)
    if (count > 50) {
      const jobs = await f.db.mutation(internal.communityRoles.claim, {
        worker: "owner-shard",
      })
      assert.deepEqual(
        await f.db.mutation(internal.communityRoles.dispatch, {
          worker: "owner-shard",
          jobs: jobs.map(({ id, revision }) => ({ id, revision })),
        }),
        []
      )
      assert.equal(f.writes.length, 0)
    }
    await f.finish()
    assert.equal((await f.status())?.state, "complete")
    assert.equal(f.writes.length, 1)
    assert.equal(
      f.writes[0]?.community_manager_tier,
      count > 0 && count <= 100 ? "1" : "0"
    )
    const requests = f.requests()
    await f.db.action(internal.communityActions.publishLinkedRoles, {
      userId: f.userId,
    })
    await f.finish()
    assert.equal(
      f.writes.length,
      1,
      "Completion/settlement must not duplicate a metadata PUT"
    )
    assert.equal(
      f.requests(),
      requests,
      "Publication must not refresh the completed snapshot again"
    )
    const batch = await f.claim()
    assert.equal(batch?.jobs.length, 1)
    assert.equal(batch.jobs[0]?.eligibility.member, "eligible")
    assert.equal(
      batch.jobs[0]?.eligibility.communityManager === "eligible",
      count > 0 && count <= 100
    )
    assert.equal(
      (await f.db.run((ctx) => ctx.db.query("communityRoleJobs").collect()))
        .length,
      1
    )
  })

test("discovery returns pending then installed after completion without refetching the provider snapshot", async (t) => {
  const f = await fixture(t, 100)
  const list = api.actions.dashboard.discord.install.listInstallableGuilds.list
  const first = await f.alice.action(list, {})
  assert.deepEqual(first, { status: "verificationPending", guilds: [] })
  assert.equal(f.requests(), 1)
  await f.finish()
  const ready = await f.alice.action(list, {})
  assert.equal(ready.status, "ready")
  assert.ok("guilds" in ready && ready.guilds.length === 100)
  assert.ok(
    "guilds" in ready &&
      ready.guilds.every((guild) => guild.state === "installed")
  )
  assert.equal(
    f.requests(),
    2,
    "Only the completed UI metadata read is additional"
  )
})

test("older completions and delayed bot jobs cannot publish after a newer revoked snapshot", async (t) => {
  const f = await fixture(t, 51)
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  await f.alice.action(api.communityActions.refreshEligibility, {})
  const old = await f.status()
  assert.ok(old && old.state !== "superseded")
  now++
  const latest = await f.db.mutation(internal.communityRoles.refreshGuilds, {
    userId: f.userId,
    discordUserId,
    observedAt: now,
    guilds: [],
    reconciliation: true,
  })
  await f.db.mutation(internal.communityRoles.continueGuildRefresh, old.ticket)
  await f.db.action(internal.communityActions.publishLinkedRoles, {
    userId: f.userId,
    refresh: old.ticket,
  })
  assert.equal(f.writes.length, 0)
  await f.finish()
  assert.equal(f.writes[0]?.community_manager_tier, "0")
  assert.equal(
    (
      await f.db.query(internal.communityRoles.refreshStatus, {
        userId: f.userId,
        discordUserId,
        ticket: old.ticket,
      })
    )?.state,
    "superseded"
  )
  assert.equal(latest.state, "complete")
  const batch = await f.claim()
  const job = batch?.jobs[0]
  assert.ok(job)
  assert.equal(
    await f.db.action(api.communityRuntime.validateJob, {
      secret: "fixture-secret",
      worker: "owner-shard",
      id: job.id,
      revision: job.revision,
    }),
    true
  )
  now++
  await f.db.mutation(internal.communityRoles.refreshGuilds, {
    userId: f.userId,
    discordUserId,
    observedAt: now,
    guilds: f.guilds,
  })
  assert.equal(
    await f.db.action(api.communityRuntime.validateJob, {
      secret: "fixture-secret",
      worker: "owner-shard",
      id: job.id,
      revision: job.revision,
    }),
    false
  )
})

test("equal observations are idempotent, conflicting equal-time revocation wins, and stale timestamps cannot renew authority", async (t) => {
  const f = await fixture(t, 1)
  const now = Date.now()
  t.mock.method(Date, "now", () => now)
  const update = (guilds: typeof f.guilds, observedAt = now) =>
    f.db.mutation(internal.communityRoles.refreshGuilds, {
      userId: f.userId,
      discordUserId,
      observedAt,
      guilds,
    })
  const first = await update(f.guilds)
  assert.deepEqual(await update(f.guilds), first)
  assert.equal((await update([])).state, "complete")
  assert.equal((await update(f.guilds)).state, "superseded")
  assert.equal((await update(f.guilds, now - 1)).state, "superseded")
  await assert.rejects(update([], now - 300000), /expired/)
  await assert.rejects(update([], now + 5001), /expired/)
  await f.finish()
  assert.equal(f.writes.length, 1)
  assert.equal(f.writes[0]?.community_manager_tier, "0")
})

test("a disconnected native grant cannot publish after an in-flight provider refresh completes", async (t) => {
  const f = await fixture(t, 51)
  let release: () => void = () => {}
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered = false
  f.holdGuilds(async () => {
    entered = true
    await waiting
  })
  const publishing = f.db.action(internal.communityActions.publishLinkedRoles, {
    userId: f.userId,
  })
  for (let i = 0; i < 30 && !entered; i++)
    await new Promise((resolve) => setImmediate(resolve))
  assert.equal(entered, true)
  await f.alice.action(api.communityActions.disconnectLinkedRoles, {})
  release()
  await publishing
  await f.finish()
  assert.equal(f.writes.length, 0)
  assert.ok(
    (
      await f.db.query(internal.discordConnections.connection, {
        userId: f.userId,
      })
    )?.revokedAt
  )
})

test("expired and identity-invalid continuations never publish successful verification", async (t) => {
  const f = await fixture(t, 100)
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  await f.alice.action(api.communityActions.refreshEligibility, {})
  const pending = await f.status()
  assert.ok(pending && pending.state !== "superseded")
  now += 300000
  assert.equal((await f.status())?.state, "expired")
  await f.db.mutation(
    internal.communityRoles.continueGuildRefresh,
    pending.ticket
  )
  await f.db.action(internal.communityActions.publishLinkedRoles, {
    userId: f.userId,
    refresh: pending.ticket,
  })
  assert.equal(f.writes.length, 0)
  now++
  await f.alice.action(api.communityActions.refreshEligibility, {})
  await f.db.run((ctx) =>
    ctx.db.patch(f.accountId, { providerAccountId: "222222222222222222" })
  )
  await f.finish()
  assert.equal(f.writes.length, 0)
  assert.equal((await f.status())?.state, "failed")
})

for (const [incoming, stored] of [
  [0, 205],
  [51, 101],
  [100, 200],
])
  test(`${stored} stored memberships and ${incoming} incoming guilds publish only after all pages complete`, async (t) => {
    const f = await fixture(t, incoming!, stored!)
    await f.alice.action(api.communityActions.refreshEligibility, {})
    assert.equal((await f.status())?.state, "pending")
    assert.equal(f.writes.length, 0)
    await f.finish()
    assert.equal((await f.status())?.state, "complete")
    const rows = await f.db.run((ctx) =>
      ctx.db.query("discordGuildMemberships").collect()
    )
    assert.equal(
      rows.filter((row) => row.canManage && row.revokedAt === undefined).length,
      incoming
    )
    assert.equal(f.writes.length, 1)
    assert.equal(
      f.writes[0]?.community_manager_tier,
      "0",
      "The conservative cap counts stored memberships, including revoked history"
    )
  })

test("completion during an older publication's token lease reliably publishes the newest result afterward", async (t) => {
  const f = await fixture(t, 1)
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  await f.alice.action(api.communityActions.refreshEligibility, {})
  let entered = false
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  f.holdPut(async () => {
    entered = true
    await gate
  })
  const previous = f.db.action(internal.communityActions.publishLinkedRoles, {
    userId: f.userId,
  })
  for (let i = 0; i < 50 && !entered; i++)
    await new Promise((resolve) => setImmediate(resolve))
  assert.ok(entered)
  const next = await f.db.mutation(internal.communityRoles.refreshGuilds, {
    userId: f.userId,
    discordUserId,
    observedAt: ++now,
    guilds: [],
    reconciliation: true,
  })
  assert.equal(next.state, "complete")
  await f.db.action(internal.communityActions.publishLinkedRoles, {
    userId: f.userId,
    refresh: next.ticket,
  })
  release()
  await previous
  f.holdPut()
  await f.finish()
  assert.deepEqual(
    f.writes.map((value) => value.community_manager_tier),
    ["1", "0"]
  )
  assert.equal(
    f.requests(),
    1,
    "Retry must use the completed revision without re-verifying"
  )
})

test("two concurrent refresh triggers share one generation and delayed provider success cannot revive a newer revocation", async (t) => {
  const f = await fixture(t, 51)
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  await Promise.all([
    f.alice.action(api.communityActions.refreshEligibility, {}),
    f.alice.action(api.communityActions.refreshEligibility, {}),
  ])
  const first = await f.status()
  assert.ok(first && first.state !== "superseded")
  assert.equal(first.ticket.revision, 1)
  await f.finish()
  assert.equal(f.writes.length, 1)
  let entered = false
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  f.holdGuilds(async () => {
    entered = true
    await gate
  })
  now++
  const old = f.alice.action(api.communityActions.refreshEligibility, {})
  for (let i = 0; i < 50 && !entered; i++)
    await new Promise((resolve) => setImmediate(resolve))
  assert.ok(entered)
  await f.db.mutation(internal.communityRoles.refreshGuilds, {
    userId: f.userId,
    discordUserId,
    observedAt: ++now,
    guilds: [],
  })
  release()
  await old
  await f.finish()
  assert.equal(f.writes.at(-1)?.community_manager_tier, "0")
})

test("a failed continuation remains pending, retries the same checkpoint and never refetches or publishes partial evidence", async (t) => {
  const f = await fixture(t, 100)
  await f.alice.action(api.communityActions.refreshEligibility, {})
  const ticket = await f.status()
  assert.equal(ticket?.state, "pending")
  const { prepareCommunityRefresh } = await import("./lib/communityRefresh")
  type Context = Parameters<typeof prepareCommunityRefresh>[0]
  let fail = true
  const ctx = {
    runQuery: f.db.query,
    runMutation: async (...args: Parameters<Context["runMutation"]>) => {
      if (fail) {
        fail = false
        throw new Error("Temporary transaction failure")
      }
      return Reflect.apply(f.db.mutation, f.db, args)
    },
  } as Context
  const identity = { userId: f.userId, discordUserId, clerkUserId: "alice" }
  assert.equal((await prepareCommunityRefresh(ctx, identity)).state, "pending")
  assert.equal(f.writes.length, 0)
  assert.equal((await prepareCommunityRefresh(ctx, identity)).state, "complete")
  await f.finish()
  assert.equal(f.writes.length, 1)
  assert.equal(f.requests(), 1)
})

test("transient metadata failure retries boundedly without losing the completed refresh", async (t) => {
  const f = await fixture(t, 1)
  await f.alice.action(api.communityActions.refreshEligibility, {})
  let attempts = 0
  f.holdPut(async () => {
    if (++attempts === 1) throw new Error("Temporary Discord outage")
  })
  await assert.rejects(
    f.db.action(internal.communityActions.publishLinkedRoles, {
      userId: f.userId,
    }),
    /outage/
  )
  await f.finish()
  assert.equal(attempts, 2)
  assert.equal(f.writes.length, 1)
  assert.equal(f.requests(), 1)
})

test("failed provider verification after expiry withholds publication instead of removing previously verified roles", async (t) => {
  const f = await fixture(t, 1)
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  await f.alice.action(api.communityActions.refreshEligibility, {})
  await f.finish()
  assert.equal(f.writes[0]?.community_manager_tier, "1")
  now += 300001
  f.holdGuilds(async () => {
    throw new Error("Provider verification unavailable")
  })
  await assert.rejects(
    f.db.action(internal.communityActions.publishLinkedRoles, {
      userId: f.userId,
    }),
    /verification unavailable/
  )
  assert.deepEqual((await f.claim())?.jobs, [])
  assert.equal(f.writes.length, 1)
  assert.equal((await f.status())?.state, "expired")
})

test("admin test qualifications use actual native metadata publication and revoke without creating paid evidence", async (t) => {
  const f = await fixture(t, 1)
  const admin = await f.db.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "admin",
      email: "admin@example.com",
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  )
  assert.ok(admin)
  const client = f.db.withIdentity({ subject: "admin" })
  const { CLEO_COMMUNITY_ROLES } =
    await import("@workspace/shared/cleoRoleEligibility")
  const input = {
    userId: f.userId,
    hours: 1,
    reason: "Verify native metadata",
    roles: [...CLEO_COMMUNITY_ROLES],
  }
  await client.mutation(api.communityRoleTesting.set, input)
  await f.finish()
  assert.deepEqual(f.writes.at(-1), {
    personal_premium: "1",
    creator_pro: "1",
    community_owner_tier: "2",
    community_manager_tier: "2",
    premium_supporter: "1",
  })
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  const grant = await f.db.run((ctx) =>
    ctx.db.query("communityRoleTestGrants").unique()
  )
  assert.ok(grant)
  await f.db.run((ctx) => ctx.db.patch(grant._id, { expiresAt: now + 5000 }))
  const job = (await f.claim())?.jobs[0]
  assert.ok(job)
  assert.equal(
    await f.db.action(api.communityRuntime.validateJob, {
      secret: "fixture-secret",
      worker: "owner-shard",
      id: job.id,
      revision: job.revision,
    }),
    true
  )
  now += 5000
  assert.equal(
    await f.db.action(api.communityRuntime.validateJob, {
      secret: "fixture-secret",
      worker: "owner-shard",
      id: job.id,
      revision: job.revision,
    }),
    false,
    "A delayed worker cannot use expired test qualification even before the expiry scheduler runs"
  )
  await client.mutation(api.communityRoleTesting.set, { ...input, roles: [] })
  await f.finish()
  assert.equal(f.writes.at(-1)?.personal_premium, "0")
  assert.equal(f.writes.at(-1)?.premium_supporter, "0")
  assert.equal(
    (
      await f.db.run((ctx) =>
        ctx.db.query("paidCommunityActivations").collect()
      )
    ).length,
    0
  )
})
