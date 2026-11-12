import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { internal } from "./_generated/api"

process.env.CLEO_COMMUNITY_ROLES_ENABLED = "true"

test("periodic role bootstrap preserves retry backoff and leases while adding missing users", async () => {
  const t = convexTest(schema, {
    "./_generated/server.js": () => import("./_generated/server.js"),
    "./communityRoles.ts": () => import("./communityRoles"),
  })
  const job = await t.run(async (ctx) => {
    const now = Date.now()
    const userId = await ctx.db.insert("users", {
      clerkUserId: "bootstrap",
      email: "bootstrap@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    for (const providerAccountId of [
      "111111111111111111",
      "222222222222222222",
    ])
      await ctx.db.insert("linkedAccounts", {
        userId,
        provider: "discord",
        providerAccountId,
        scopes: [],
        createdAt: now,
        updatedAt: now,
      })
    const id = await ctx.db.insert("communityRoleJobs", {
      discordUserId: "111111111111111111",
      revision: 7,
      attempts: 8,
      worker: "active",
      leaseUntil: now + 60000,
      nextAt: now + 300000,
    })
    return (await ctx.db.get(id))!
  })
  await t.mutation(internal.communityRoles.bootstrap, {})
  assert.deepEqual(await t.run((ctx) => ctx.db.get(job._id)), job)
  assert.equal(
    (await t.run((ctx) => ctx.db.query("communityRoleJobs").collect())).length,
    2
  )
  await t.mutation(internal.communityRoles.bootstrap, {})
  assert.equal(
    (await t.run((ctx) => ctx.db.query("communityRoleJobs").collect())).length,
    2
  )
  await t.mutation(internal.communityRoles.enqueue, {
    discordUserId: job.discordUserId,
  })
  const changed = await t.run((ctx) => ctx.db.get(job._id))
  assert.equal(changed?.revision, 8)
  assert.equal(changed?.attempts, 0)
  assert.equal(changed?.leaseUntil, job.leaseUntil)
})


test("successful role jobs recheck at the Discord verification TTL and retain revision publication receipts", async () => {
  const t = convexTest(schema, {
    "./_generated/server.js": () => import("./_generated/server.js"),
    "./communityRoles.ts": () => import("./communityRoles"),
  })
  const discordUserId = "333333333333333333"
  const worker = "settlement-worker"
  const now = Date.now()
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "role-settle",
      email: "role-settle@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId: discordUserId,
      scopes: [],
      createdAt: now,
      updatedAt: now,
    })
    return ctx.db.insert("communityRoleJobs", {
      discordUserId,
      revision: 3,
      attemptedRevision: 3,
      worker,
      leaseUntil: now + 60000,
      attempts: 0,
      nextAt: now,
    })
  })
  await t.mutation(internal.communityRoles.settle, {
    id,
    worker,
    revision: 3,
    success: true,
  })
  const publications = async () =>
    (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()))
      .filter((entry) => entry.name.endsWith("communityActions:publishLinkedRoles"))
  const linkedUserId = await t.run(async (ctx) => {
    const account = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "discord").eq("providerAccountId", discordUserId)
      )
      .unique()
    assert.ok(account)
    return account.userId
  })
  assert.equal((await publications()).length, 1)
  const first = await t.run((ctx) => ctx.db.get(id))
  assert.equal(first?.lastSuccessfulRevision, 3)
  assert.equal(first?.attempts, 0)
  assert.ok((first?.nextAt ?? 0) >= now + 300000)
  assert.ok((first?.nextAt ?? Infinity) <= Date.now() + 300000)

  // A subsequent periodic success is not a new publication revision.
  await t.run((ctx) =>
    ctx.db.patch(id, {
      leaseUntil: Date.now() + 60000,
      nextAt: Date.now(),
    })
  )
  await t.mutation(internal.communityRoles.settle, {
    id,
    worker,
    revision: 3,
    success: true,
  })
  const repeat = await t.run((ctx) => ctx.db.get(id))
  assert.equal(repeat?.lastSuccessfulRevision, 3)
  assert.equal((await publications()).length, 1, "a repeat must not publish")
  assert.ok((repeat?.nextAt ?? 0) >= now + 300000)

  // Explicit eligibility changes still open a fresh publication generation.
  await t.mutation(internal.communityRoles.enqueue, { discordUserId })
  await t.run((ctx) =>
    ctx.db.patch(id, {
      attemptedRevision: 4,
      leaseUntil: Date.now() + 60000,
      worker,
    })
  )
  await t.mutation(internal.communityRoles.settle, {
    id,
    worker,
    revision: 4,
    success: true,
  })
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.lastSuccessfulRevision, 4)
  const scheduled = await publications()
  assert.equal(scheduled.length, 2, "a new revision must publish once")
  for (const entry of scheduled)
    assert.equal(entry.args[0]?.userId, linkedUserId)

  // The deadline begins with provider observation, not settlement.
  const authorityUntil = Date.now() + 30_000
  await t.run((ctx) =>
    ctx.db.patch(id, {
      revision: 5,
      attemptedRevision: 5,
      leaseUntil: Date.now() + 60_000,
      authorityUntil,
    })
  )
  await t.mutation(internal.communityRoles.settle, {
    id,
    worker,
    revision: 5,
    success: true,
  })
  const bounded = await t.run((ctx) => ctx.db.get(id))
  assert.ok(bounded)
  assert.ok(bounded.nextAt < authorityUntil)
  assert.ok(bounded.nextAt >= Date.now() + 4990)
  assert.equal((await publications()).length, 3)
})
