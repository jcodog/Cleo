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
