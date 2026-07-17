import assert from "node:assert/strict"
import test from "node:test"
import { convexTest } from "convex-test"

import { api, internal } from "../../../_generated/api"
import schema from "../../../schema"
import {
  CURRENT_ONBOARDING_VERSION,
  ONBOARDING_ROLLOUT_AT,
} from "../../../../src/shared/onboarding"

const modules = {
  "./_generated/server.js": () => import("../../../_generated/server.js"),
  "./mutations/dashboard/account/onboarding.ts": () => import("./onboarding"),
  "./mutations/integrations/clerk/users.ts": () =>
    import("../../integrations/clerk/users"),
}

test("new Clerk users are durably marked for onboarding", async () => {
  const t = convexTest({ schema, modules })
  const userId = await t.mutation(
    internal.mutations.integrations.clerk.users.upsertFromWebhook,
    {
      data: {
        id: "clerk-new",
        email_addresses: [{ id: "email-1", email_address: "new@example.com" }],
        primary_email_address_id: "email-1",
        external_accounts: [],
      },
    }
  )
  const user = await t.run((ctx) => ctx.db.get(userId))

  assert.equal(user?.onboardingProvenance, "post-rollout")
  assert.equal(user?.onboardingCompletedAt, undefined)
  assert.equal(user?.onboardingVersion, undefined)
})

test("genuine legacy accounts receive an explicit durable migration", async () => {
  const t = convexTest({ schema, modules })
  const createdAt = ONBOARDING_ROLLOUT_AT - 1
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk-legacy",
      email: "legacy@example.com",
      role: "user",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    })
  )

  const result = await t
    .withIdentity({ subject: "clerk-legacy" })
    .mutation(api.mutations.dashboard.account.onboarding.resolveProvenance, {})

  assert.deepEqual(result, {
    onboardingCompletedAt: createdAt,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingProvenance: "pre-rollout",
  })
})

test("partial pre-rollout migration state is normalized and persisted", async () => {
  const t = convexTest({ schema, modules })
  const createdAt = ONBOARDING_ROLLOUT_AT - 10
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk-partial-legacy",
      email: "partial-legacy@example.com",
      role: "user",
      status: "active",
      onboardingProvenance: "pre-rollout",
      onboardingVersion: CURRENT_ONBOARDING_VERSION - 1,
      createdAt,
      updatedAt: createdAt,
    })
  )

  const result = await t
    .withIdentity({ subject: "clerk-partial-legacy" })
    .mutation(api.mutations.dashboard.account.onboarding.resolveProvenance, {})
  const user = await t.run((ctx) => ctx.db.get(userId))

  assert.deepEqual(result, {
    onboardingCompletedAt: createdAt,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingProvenance: "pre-rollout",
  })
  assert.equal(user?.onboardingCompletedAt, createdAt)
  assert.equal(user?.onboardingVersion, CURRENT_ONBOARDING_VERSION)
  assert.equal(user?.onboardingProvenance, "pre-rollout")
})

test("pre-rollout migration fills a missing version without replacing its timestamp", async () => {
  const t = convexTest({ schema, modules })
  const createdAt = ONBOARDING_ROLLOUT_AT - 15
  const completedAt = createdAt + 3
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk-missing-version-legacy",
      email: "missing-version-legacy@example.com",
      role: "user",
      status: "active",
      onboardingCompletedAt: completedAt,
      onboardingProvenance: "pre-rollout",
      createdAt,
      updatedAt: createdAt,
    })
  )

  const result = await t
    .withIdentity({ subject: "clerk-missing-version-legacy" })
    .mutation(api.mutations.dashboard.account.onboarding.resolveProvenance, {})
  const user = await t.run((ctx) => ctx.db.get(userId))

  assert.deepEqual(result, {
    onboardingCompletedAt: completedAt,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingProvenance: "pre-rollout",
  })
  assert.equal(user?.onboardingCompletedAt, completedAt)
  assert.equal(user?.onboardingVersion, CURRENT_ONBOARDING_VERSION)
})

test("pre-rollout normalization preserves newer versions and timestamps", async () => {
  const t = convexTest({ schema, modules })
  const createdAt = ONBOARDING_ROLLOUT_AT - 20
  const completedAt = createdAt + 5
  const newerVersion = CURRENT_ONBOARDING_VERSION + 2
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk-newer-legacy",
      email: "newer-legacy@example.com",
      role: "user",
      status: "active",
      onboardingCompletedAt: completedAt,
      onboardingVersion: newerVersion,
      onboardingProvenance: "pre-rollout",
      createdAt,
      updatedAt: createdAt,
    })
  )

  const result = await t
    .withIdentity({ subject: "clerk-newer-legacy" })
    .mutation(api.mutations.dashboard.account.onboarding.resolveProvenance, {})
  const user = await t.run((ctx) => ctx.db.get(userId))

  assert.deepEqual(result, {
    onboardingCompletedAt: completedAt,
    onboardingVersion: newerVersion,
    onboardingProvenance: "pre-rollout",
  })
  assert.equal(user?.onboardingCompletedAt, completedAt)
  assert.equal(user?.onboardingVersion, newerVersion)
})

test("a later sync cannot classify a new incomplete account as legacy", async () => {
  const t = convexTest({ schema, modules })
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk-current",
      email: "current@example.com",
      role: "user",
      status: "active",
      createdAt: ONBOARDING_ROLLOUT_AT + 1,
      updatedAt: ONBOARDING_ROLLOUT_AT + 1,
    })
  )
  const asCurrentUser = t.withIdentity({ subject: "clerk-current" })

  const resolved = await asCurrentUser.mutation(
    api.mutations.dashboard.account.onboarding.resolveProvenance,
    {}
  )
  await t.mutation(
    internal.mutations.integrations.clerk.users.upsertFromWebhook,
    {
      data: {
        id: "clerk-current",
        email_addresses: [
          { id: "email-2", email_address: "current-updated@example.com" },
        ],
        primary_email_address_id: "email-2",
        external_accounts: [],
      },
    }
  )
  const user = await t.run((ctx) => ctx.db.get(userId))

  assert.deepEqual(resolved, {
    onboardingCompletedAt: null,
    onboardingVersion: null,
    onboardingProvenance: "post-rollout",
  })
  assert.equal(user?.onboardingProvenance, "post-rollout")
  assert.equal(user?.onboardingCompletedAt, undefined)
})

test("completion preserves a newer version and original timestamp", async () => {
  const t = convexTest({ schema, modules })
  const completedAt = 123
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk-complete",
      email: "complete@example.com",
      role: "user",
      status: "active",
      onboardingCompletedAt: completedAt,
      onboardingVersion: CURRENT_ONBOARDING_VERSION + 3,
      onboardingProvenance: "post-rollout",
      createdAt: ONBOARDING_ROLLOUT_AT + 1,
      updatedAt: ONBOARDING_ROLLOUT_AT + 1,
    })
  )

  const result = await t
    .withIdentity({ subject: "clerk-complete" })
    .mutation(api.mutations.dashboard.account.onboarding.complete, {})

  assert.deepEqual(result, {
    onboardingCompletedAt: completedAt,
    onboardingVersion: CURRENT_ONBOARDING_VERSION + 3,
    onboardingProvenance: "post-rollout",
  })
})

test("completion upgrades an older version without replacing its timestamp", async () => {
  const t = convexTest({ schema, modules })
  const completedAt = 456
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk-outdated",
      email: "outdated@example.com",
      role: "user",
      status: "active",
      onboardingCompletedAt: completedAt,
      onboardingVersion: CURRENT_ONBOARDING_VERSION - 1,
      createdAt: ONBOARDING_ROLLOUT_AT + 1,
      updatedAt: ONBOARDING_ROLLOUT_AT + 1,
    })
  )

  const result = await t
    .withIdentity({ subject: "clerk-outdated" })
    .mutation(api.mutations.dashboard.account.onboarding.complete, {})
  const user = await t.run((ctx) => ctx.db.get(userId))

  assert.deepEqual(result, {
    onboardingCompletedAt: completedAt,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingProvenance: "post-rollout",
  })
  assert.equal(user?.onboardingCompletedAt, completedAt)
  assert.equal(user?.onboardingVersion, CURRENT_ONBOARDING_VERSION)
  assert.equal(user?.onboardingProvenance, "post-rollout")
})
