import assert from "node:assert/strict"
import { test, beforeEach, afterEach, mock } from "node:test"
import { convexTest } from "convex-test"
import {
  CLEO_COMMUNITY_ROLES,
  cleoRoleMetadata,
} from "@workspace/shared/cleoRoleEligibility"
import schema from "./schema"
import { api, internal } from "./_generated/api"

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
afterEach(() => mock.timers.reset())

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./communityRoleTesting.ts": () => import("./communityRoleTesting"),
  "./communityRoles.ts": () => import("./communityRoles"),
}
async function setup() {
  const db = convexTest(schema, modules)
  const ids = await db.run(async (ctx) => {
    const now = Date.now()
    const insert = (clerkUserId: string, role: "user" | "admin" | "staff") =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@example.com`,
        role,
        createdAt: now,
        updatedAt: now,
      })
    const admin = await insert("admin", "admin"),
      user = await insert("alice", "user"),
      staff = await insert("staff", "staff")
    const account = await ctx.db.insert("linkedAccounts", {
      userId: user,
      provider: "discord",
      providerAccountId: "111111111111111111",
      scopes: [],
      createdAt: now,
      updatedAt: now,
    })
    return { admin, user, staff, account }
  })
  return {
    db,
    ...ids,
    adminClient: db.withIdentity({ subject: "admin" }),
    alice: db.withIdentity({ subject: "alice" }),
    staffClient: db.withIdentity({ subject: "staff" }),
  }
}
test("only admins can select users and grant role tests; actual entitlements and permissions stay unchanged", async () => {
  const f = await setup()
  assert.equal(await f.alice.query(api.communityRoleTesting.access, {}), false)
  assert.equal(
    await f.adminClient.query(api.communityRoleTesting.access, {}),
    true
  )
  const input = {
    userId: f.user,
    roles: [...CLEO_COMMUNITY_ROLES],
    hours: 1,
    reason: "Verify Discord setup",
  }
  await assert.rejects(
    f.alice.mutation(api.communityRoleTesting.set, input),
    /Admin access/
  )
  await assert.rejects(
    f.staffClient.query(api.communityRoleTesting.users, {
      paginationOpts: { cursor: null, numItems: 50 },
    }),
    /Admin access/
  )
  await f.adminClient.mutation(api.communityRoleTesting.set, input)
  const eligibility = await f.alice.query(api.communityRoles.current, {})
  assert.ok(
    eligibility &&
      Object.values(eligibility).every((status) => status === "eligible")
  )
  assert.deepEqual(cleoRoleMetadata(eligibility), {
    personal_premium: "1",
    creator_pro: "1",
    community_owner_tier: "2",
    community_manager_tier: "2",
    premium_supporter: "1",
  })
  const evidence = await f.db.run(async (ctx) => ({
    grants: await ctx.db.query("communityRoleTestGrants").collect(),
    payments: await ctx.db.query("paidCommunityActivations").collect(),
    guilds: await ctx.db.query("discordGuildMemberships").collect(),
    announcements: await ctx.db.query("communityAnnouncementOutbox").collect(),
  }))
  assert.equal(evidence.grants[0]?.grantedBy, f.admin)
  assert.equal(evidence.grants[0]?.reason, input.reason)
  assert.equal(
    evidence.payments.length +
      evidence.guilds.length +
      evidence.announcements.length,
    0
  )
  await f.adminClient.mutation(api.communityRoleTesting.set, {
    ...input,
    roles: [],
  })
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.personalPremium,
    "unavailable"
  )
  assert.equal(
    await f.adminClient.query(api.communityRoleTesting.current, {
      userId: f.user,
    }),
    null
  )
})
test("test qualifications expire, bind to the current identity, and superseded expiry cannot remove a newer grant", async (t) => {
  const f = await setup()
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  const input = {
    userId: f.user,
    roles: ["premiumCommunityOwner" as const],
    hours: 1,
    reason: "Boundary test",
  }
  await f.adminClient.mutation(api.communityRoleTesting.set, input)
  const first = await f.db.run((ctx) =>
    ctx.db.query("communityRoleTestGrants").first()
  )
  assert.ok(first)
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.communityOwner,
    "eligible"
  )
  now += 3600000
  assert.notEqual(
    (await f.alice.query(api.communityRoles.current, {}))
      ?.premiumCommunityOwner,
    "eligible"
  )
  await f.adminClient.mutation(api.communityRoleTesting.set, {
    ...input,
    roles: ["creatorPro"],
  })
  await f.db.mutation(internal.communityRoleTesting.expire, { id: first._id })
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.creatorPro,
    "eligible"
  )
  await f.db.run((ctx) =>
    ctx.db.patch(f.account, { providerAccountId: "222222222222222222" })
  )
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.creatorPro,
    "unavailable"
  )
  assert.equal(
    await f.adminClient.query(api.communityRoleTesting.current, {
      userId: f.user,
    }),
    null
  )
})
test("invalid or unverified test grants fail closed and concurrent replacement leaves only one active grant", async () => {
  const f = await setup()
  const input = {
    userId: f.user,
    roles: ["personalPremium" as const],
    hours: 1,
    reason: "Concurrent test",
  }
  for (const hours of [0, 1.5, 25])
    await assert.rejects(
      f.adminClient.mutation(api.communityRoleTesting.set, { ...input, hours }),
      /duration/
    )
  await assert.rejects(
    f.adminClient.mutation(api.communityRoleTesting.set, {
      ...input,
      reason: " ",
    }),
    /reason/
  )
  await Promise.all([
    f.adminClient.mutation(api.communityRoleTesting.set, input),
    f.adminClient.mutation(api.communityRoleTesting.set, {
      ...input,
      roles: ["creatorPro"],
    }),
  ])
  const grants = await f.db.run((ctx) =>
    ctx.db.query("communityRoleTestGrants").collect()
  )
  assert.equal(
    grants.filter((grant) => grant.revokedAt === undefined).length,
    1
  )
  await f.db.run((ctx) => ctx.db.patch(f.user, { status: "disabled" }))
  await assert.rejects(
    f.adminClient.mutation(api.communityRoleTesting.set, input),
    /active user/
  )
})
