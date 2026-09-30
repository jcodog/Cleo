import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { afterEach, test } from "node:test"

import { makeFunctionReference } from "convex/server"
import { ConvexError } from "convex/values"
import { convexTest, type TestConvex } from "convex-test"

import { api, internal } from "./_generated/api"
import type { ClerkUserData } from "./lib/clerkUserData"
import schema from "./schema"

// Discover actual modules so restoring a removed write also restores it in this test.
const modules = Object.fromEntries(
  readdirSync(new URL(".", import.meta.url), {
    recursive: true,
    encoding: "utf8",
  })
    .map((path) => path.replaceAll("\\", "/"))
    .filter(
      (path) =>
        (path.endsWith(".ts") &&
          !path.endsWith(".test.ts") &&
          !path.endsWith(".d.ts")) ||
        path === "_generated/server.js"
    )
    .map((path) => [`./${path}`, () => import(`./${path}`)])
)

// Keep a runtime reference to exercise old clients after the public API is removed.
const unverifiedLink = makeFunctionReference<"mutation">(
  "mutations/dashboard/account/linkedAccounts/upsert:upsertForCurrentUser"
)
const discordUserId = "123456789012345678"
const originalFetch = globalThis.fetch
const originalClerkSecret = process.env.CLERK_SECRET_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalClerkSecret === undefined) {
    delete process.env.CLERK_SECRET_KEY
  } else {
    process.env.CLERK_SECRET_KEY = originalClerkSecret
  }
})

test("an unverified Discord claim cannot unlock the guild-manager fallback", async () => {
  const t = convexTest({ schema, modules })
  await seedUser(t, "attacker")
  const guildId = await seedManagedGuild(t)
  const attacker = t.withIdentity({ subject: "attacker" })

  await assert.rejects(
    attacker.query(api.queries.dashboard.discord.guildConfigs.byGuildId.get, {
      guildId,
    }),
    isForbidden
  )
  assert.equal(
    await attacker.query(api.queries.dashboard.account.discordIdentity.get, {}),
    null
  )

  const [write] = await Promise.allSettled([
    attacker.mutation(unverifiedLink, {
      provider: "discord",
      providerAccountId: discordUserId,
      scopes: [],
    }),
  ])
  const identity = await attacker.query(
    api.queries.dashboard.account.discordIdentity.get,
    {}
  )
  const [access] = await Promise.allSettled([
    attacker.query(api.queries.dashboard.discord.guildConfigs.byGuildId.get, {
      guildId,
    }),
  ])

  assert.deepEqual(
    {
      writeAccepted: write?.status === "fulfilled",
      linkedDiscordId: identity?.providerAccountId ?? null,
      protectedReadAllowed: access?.status === "fulfilled",
    },
    {
      writeAccepted: false,
      linkedDiscordId: null,
      protectedReadAllowed: false,
    }
  )
  assert.ok(write?.status === "rejected")
  assert.match(String(write.reason), /Could not find module/)
  assert.ok(access?.status === "rejected")
  assert.ok(isForbidden(access.reason))
})

test("the removed public write cannot claim or modify another user's linked identity", async () => {
  const t = convexTest({ schema, modules })
  await seedUser(t, "attacker")
  const ownerId = await t.mutation(
    internal.mutations.integrations.clerk.users.upsertFromWebhook,
    { data: clerkData("owner") }
  )
  const owner = t.withIdentity({ subject: "owner" })
  const before = await owner.query(
    api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
    {}
  )
  const attacker = t.withIdentity({ subject: "attacker" })

  await assert.rejects(
    attacker.mutation(unverifiedLink, {
      provider: "discord",
      providerAccountId: discordUserId,
      username: "forged-name",
      scopes: ["identify", "guilds"],
      accessTokenSecretId: "forged-secret",
    }),
    /Could not find module/
  )
  assert.deepEqual(
    await owner.query(
      api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
      {}
    ),
    before
  )
  assert.equal(before[0]?.userId, ownerId)
  assert.deepEqual(
    await attacker.query(
      api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
      {}
    ),
    []
  )
})

test("dashboard sync gets identity from Clerk and preserves account reads and guild access", async () => {
  const t = convexTest({ schema, modules })
  const guildId = await seedManagedGuild(t)
  const manager = t.withIdentity({ subject: "manager" })
  process.env.CLERK_SECRET_KEY = "test-clerk-secret"
  let fetchCount = 0
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.clerk.com/v1/users/manager")
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-clerk-secret"
    )
    fetchCount += 1
    return Response.json(clerkData("manager"))
  }

  const first = await manager.action(
    api.actions.dashboard.account.syncLinkedAccounts.sync,
    {}
  )
  assert.equal(first.status, "ready")
  assert.ok(first.status === "ready")
  assert.equal(first.linkedAccounts.length, 1)
  const linkedAccount = first.linkedAccounts[0]
  assert.ok(linkedAccount)
  assert.equal(linkedAccount.provider, "discord")
  assert.equal(linkedAccount.providerAccountId, discordUserId)
  assert.deepEqual(linkedAccount.scopes, ["identify", "guilds"])

  const second = await manager.action(
    api.actions.dashboard.account.syncLinkedAccounts.sync,
    {}
  )
  assert.ok(second.status === "ready")
  assert.equal(second.linkedAccounts.length, 1)
  assert.equal(second.linkedAccounts[0]?._id, linkedAccount._id)
  assert.equal(fetchCount, 2)
  assert.deepEqual(
    await manager.query(api.queries.dashboard.account.discordIdentity.get, {}),
    second.linkedAccounts[0]
  )
  const onboarding = await manager.query(
    api.queries.dashboard.account.onboarding.get,
    {}
  )
  assert.ok(onboarding.status === "ready")
  assert.equal(onboarding.discordIdentity?.username, "verified-manager")
  assert.equal(
    await manager.query(
      api.queries.dashboard.discord.guildConfigs.byGuildId.get,
      {
        guildId,
      }
    ),
    null
  )
  const guilds = await manager.query(
    api.queries.dashboard.discord.guilds.manageable.list,
    {}
  )
  assert.equal(guilds[0]?.guildId, guildId)
  assert.deepEqual(
    await t.query(
      api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
      {}
    ),
    []
  )
  assert.equal(
    await t.query(api.queries.dashboard.account.discordIdentity.get, {}),
    null
  )
})

test("public sync rejects identity payloads and requires authentication and available Clerk evidence", async () => {
  const t = convexTest({ schema, modules })
  const userId = await seedUser(t, "attacker")
  const attacker = t.withIdentity({ subject: "attacker" })
  const sync = api.actions.dashboard.account.syncLinkedAccounts.sync
  delete process.env.CLERK_SECRET_KEY
  globalThis.fetch = async () => {
    assert.fail("Untrusted input must not reach Clerk or linked-account writes")
  }

  await assert.rejects(
    t.action(sync, {}),
    (error: unknown) =>
      error instanceof ConvexError && error.data.code === "UNAUTHORIZED"
  )
  // A runtime reference bypasses client types, just as a direct public caller can.
  await assert.rejects(
    attacker.action(
      makeFunctionReference<"action">(
        "actions/dashboard/account/syncLinkedAccounts:sync"
      ),
      { providerAccountId: discordUserId }
    ),
    /Validator error/
  )
  assert.deepEqual(await attacker.action(sync, {}), {
    status: "unavailable",
    reason: "clerkSecretUnavailable",
  })
  assert.deepEqual(
    await t.run((ctx) =>
      ctx.db
        .query("linkedAccounts")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .collect()
    ),
    []
  )
})

test("trusted Clerk evidence resolves conflicting ownership while preserving the row and previous user", async () => {
  const t = convexTest({ schema, modules })
  const sync = internal.mutations.integrations.clerk.users.upsertFromWebhook
  const oldUserId = await t.mutation(sync, {
    data: clerkData("previous-owner"),
  })
  const previousOwner = t.withIdentity({ subject: "previous-owner" })
  const [before] = await previousOwner.query(
    api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
    {}
  )
  assert.ok(before)

  const newUserId = await t.mutation(sync, {
    data: clerkData("verified-owner"),
  })
  const verifiedOwner = t.withIdentity({ subject: "verified-owner" })
  const [after] = await verifiedOwner.query(
    api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
    {}
  )
  assert.ok(after)
  assert.notEqual(newUserId, oldUserId)
  assert.equal(after._id, before._id)
  assert.equal(after.createdAt, before.createdAt)
  assert.equal(after.userId, newUserId)
  assert.deepEqual(
    await previousOwner.query(
      api.queries.dashboard.account.linkedAccounts.listForCurrentUser,
      {}
    ),
    []
  )
  assert.ok(await t.run((ctx) => ctx.db.get(oldUserId)))
  assert.equal(
    await t.run(
      async (ctx) => (await ctx.db.query("linkedAccounts").collect()).length
    ),
    1
  )
})

function clerkData(clerkUserId: string): ClerkUserData {
  return {
    id: clerkUserId,
    email_addresses: [{ email_address: `${clerkUserId}@example.com` }],
    external_accounts: [
      {
        provider: "oauth_discord",
        provider_user_id: discordUserId,
        username: `verified-${clerkUserId}`,
        approved_scopes: "identify guilds",
      },
    ],
  }
}

function isForbidden(error: unknown): boolean {
  return error instanceof ConvexError && error.data.code === "FORBIDDEN"
}

async function seedUser(t: TestConvex<typeof schema>, clerkUserId: string) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@example.com`,
      role: "user",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    })
  )
}

async function seedManagedGuild(t: TestConvex<typeof schema>) {
  const guildId = await t.run((ctx) =>
    ctx.db.insert("guilds", {
      discordGuildId: "234567890123456789",
      name: "Managed guild",
      botJoinedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
  )
  // The internal verification handler supports memberships without a Cleo userId.
  await t.mutation(
    internal.mutations.bot.discord.guildMemberships.upsertVerified.upsert,
    {
      guildId,
      discordUserId,
      canManage: true,
      managementVerifiedAt: 1,
      managementVerificationSource: "discord-bot",
    }
  )
  return guildId
}
