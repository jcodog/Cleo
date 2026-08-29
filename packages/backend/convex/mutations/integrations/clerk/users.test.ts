import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { internal } from "../../../_generated/api"
import schema from "../../../schema"

const modules = {
  "./_generated/server.js": () => import("../../../_generated/server.js"),
  "./mutations/integrations/clerk/users.ts": () => import("./users"),
}

const clerkUserId = "user_returning"
const discordUserId = "123456789012345678"

const clerkUserData = {
  id: clerkUserId,
  primary_email_address_id: "email_primary",
  email_addresses: [
    {
      id: "email_primary",
      email_address: "returning@example.com",
    },
  ],
  external_accounts: [
    {
      id: "external_discord",
      provider: "oauth_discord",
      provider_user_id: discordUserId,
      username: "returning-user",
      approved_scopes: "identify guilds",
    },
  ],
  first_name: "Returning",
  last_name: "User",
  image_url: "https://example.com/avatar.png",
}

test("Clerk re-sync preserves returning-user onboarding state without duplicating records", async () => {
  const t = convexTest({ schema, modules })
  const createdAt = 1_800_000_000_000
  const onboardingCompletedAt = createdAt + 1_000

  const existingUserId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      clerkUserId,
      email: "old@example.com",
      displayName: "Old profile",
      imageUrl: null,
      role: "admin",
      status: "active",
      onboardingCompletedAt,
      onboardingVersion: 1,
      onboardingProvenance: "post-rollout",
      createdAt,
      updatedAt: createdAt,
    })
  })

  await t.mutation(
    internal.mutations.integrations.clerk.users.upsertFromWebhook,
    { data: clerkUserData }
  )
  await t.mutation(
    internal.mutations.integrations.clerk.users.upsertFromWebhook,
    { data: clerkUserData }
  )

  const stored = await t.run(async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .collect()

    const linkedAccounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "discord").eq("providerAccountId", discordUserId)
      )
      .collect()

    return { users, linkedAccounts }
  })

  assert.equal(stored.users.length, 1)
  assert.equal(stored.users[0]?._id, existingUserId)
  assert.equal(stored.users[0]?.email, "returning@example.com")
  assert.equal(stored.users[0]?.displayName, "Returning User")
  assert.equal(stored.users[0]?.role, "admin")
  assert.equal(stored.users[0]?.onboardingCompletedAt, onboardingCompletedAt)
  assert.equal(stored.users[0]?.onboardingVersion, 1)
  assert.equal(stored.users[0]?.onboardingProvenance, "post-rollout")

  assert.equal(stored.linkedAccounts.length, 1)
  assert.equal(stored.linkedAccounts[0]?.userId, existingUserId)
  assert.equal(stored.linkedAccounts[0]?.provider, "discord")
  assert.equal(stored.linkedAccounts[0]?.providerAccountId, discordUserId)
})
