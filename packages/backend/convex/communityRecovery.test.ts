import assert from "node:assert/strict"
import { test, beforeEach, afterEach, mock, type TestContext } from "node:test"
import { createHmac, createHash } from "node:crypto"
import { convexTest } from "convex-test"
import { CLEO_GUILD_CAPABILITIES } from "@workspace/shared/cleoEntitlements"
import schema from "./schema"
import { api, internal } from "./_generated/api"

process.env.CLEO_OFFICIAL_GUILD_ID = "999999999999999999"
process.env.CLEO_COMMUNITY_ROLES_ENABLED = "true"
process.env.CLEO_MANAGED_ROLE_IDS = "{}"
process.env.CLEO_RECOGNITION_ENABLED = "true"
process.env.CLEO_COMMUNITY_UPGRADES_CHANNEL_ID = "888888888888888888"
process.env.DISCORD_BOT_CONVEX_SECRET = "fixture-secret"
process.env.DISCORD_BOT_TOKEN = "fixture-bot"
process.env.CLERK_SECRET_KEY = "fixture-clerk"
process.env.DISCORD_APPLICATION_ID = "777777777777777777"
process.env.DISCORD_CLIENT_SECRET = "fixture-client"
process.env.DISCORD_ROLE_CONNECTION_REDIRECT_URL =
  "https://dashboard.example/discord/linked-role"
process.env.DISCORD_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString(
  "base64"
)
process.env.STRIPE_SECRET_KEY = "sk_test_fixture"
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture"
process.env.STRIPE_GUILD_PREMIUM_PRICE_ID = "price_premium"

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
afterEach(() => mock.timers.reset())
const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./communityRuntime.ts": () => import("./communityRuntime"),
  "./communityRoles.ts": () => import("./communityRoles"),
  "./communityActions.ts": () => import("./communityActions"),
  "./discordConnections.ts": () => import("./discordConnections"),
  "./premiumPurchases.ts": () => import("./premiumPurchases"),
  "./premiumActions.ts": () => import("./premiumActions"),
  "./communityRecognition.ts": () => import("./communityRecognition"),
  "./recognitionActions.ts": () => import("./recognitionActions"),
}
const discordUserId = "111111111111111111",
  discordGuildId = "333333333333333333"
function fetchFixture(t: TestContext, implementation: typeof fetch) {
  const previous = globalThis.fetch
  globalThis.fetch = implementation
  t.after(() => {
    globalThis.fetch = previous
  })
}
async function fixture() {
  const t = convexTest(schema, modules)
  const now = Date.now()
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "alice",
      email: "alice@example.com",
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
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId,
      name: "Private @everyone **Community**\u202e",
      ownerDiscordId: discordUserId,
      botInstallationVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    const customerId = await ctx.db.insert("billingCustomers", {
      userId,
      clerkUserId: "alice",
      stripeCustomerId: "cus_alice",
      createdAt: now,
    })
    await ctx.db.insert("guildBillingPrices", {
      stripePriceId: "price_premium",
      stripeProductId: "prod_premium",
      enabled: true,
      updatedAt: now,
    })
    return { userId, guildId, customerId }
  })
  const reservation = await t.mutation(internal.premiumPurchases.reserve, {
    ...{ userId: ids.userId },
    discordUserId,
    discordGuildId,
    purchaserKind: "owner",
    announce: true,
    displayRole: false,
    key: "checkout",
  })
  const apply = {
    worker: "billing",
    subscriptionId: "sub_one",
    customerId: "cus_alice",
    checkoutKey: reservation.key,
    productId: "prod_premium",
    priceId: "price_premium",
    status: "active" as const,
    startsAt: now - 1000,
    endsAt: now + 3600000,
    cancelAtPeriodEnd: false,
    revoked: false,
    testMode: false,
    paidInvoice: {
      id: "in_one",
      paidUntil: now + 3600000,
      payments: [{ paymentIntentId: "pi_one", chargeId: "ch_one" }],
    },
    eventId: "paid-one",
  }
  const activate = async (overrides: Partial<typeof apply> = {}) => {
    const args = { ...apply, ...overrides }
    assert.equal(
      await t.mutation(internal.premiumPurchases.acquire, {
        subscriptionId: args.subscriptionId,
        worker: args.worker,
      }),
      true
    )
    await t.mutation(internal.premiumPurchases.apply, args)
  }
  return {
    t,
    ...ids,
    reservation,
    apply,
    activate,
    alice: t.withIdentity({ subject: "alice" }),
  }
}

test("role batches prepare slow providers concurrently and dispatch fresh fenced leases", async (t) => {
  const f = await fixture()
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  const ids = [
    discordUserId,
    "211111111111111111",
    "311111111111111111",
    "411111111111111111",
    "511111111111111111",
  ]
  await f.t.run(async (ctx) => {
    for (const id of ids.slice(1)) {
      const userId = await ctx.db.insert("users", {
        clerkUserId: id,
        email: `${id}@example.com`,
        role: "user",
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert("linkedAccounts", {
        userId,
        provider: "discord",
        providerAccountId: id,
        scopes: [],
        createdAt: now,
        updatedAt: now,
      })
    }
  })
  for (const id of ids)
    await f.t.mutation(internal.communityRoles.enqueue, { discordUserId: id })
  let release: () => void = () => {},
    started = 0
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  fetchFixture(t, async (input, init) => {
    const url = String(input)
    if (url.includes("oauth_access_tokens")) {
      started++
      await pending
      const id = url.includes("/alice/")
        ? discordUserId
        : ids.find((id) => url.includes(id))!
      if (id === ids[4]) return new Response("unavailable", { status: 503 })
      return Response.json([{ token: id }])
    }
    const id = new Headers(init?.headers)
      .get("Authorization")!
      .replace("Bearer ", "")
    return Response.json(url.endsWith("/users/@me") ? { id } : [])
  })
  const work = f.t.action(api.communityRuntime.claimJobs, {
    secret: "fixture-secret",
    worker: "shard-owner",
  })
  for (let i = 0; i < 20 && started < 5; i++)
    await new Promise((resolve) => setImmediate(resolve))
  assert.equal(started, 5)
  now += 55000
  release()
  const result = await work
  assert.equal(result?.jobs.length, 5)
  assert.ok(result.jobs.every((job) => job.leaseUntil === now + 60000))
  assert.deepEqual(
    await f.t.mutation(internal.communityRoles.dispatch, {
      worker: "other-worker",
      jobs: result.jobs.map(({ id, revision }) => ({ id, revision })),
    }),
    []
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(result.jobs[0]!.id)))?.leaseUntil,
    now + 60000
  )
  const stale = result.jobs[0]!
  await f.t.mutation(internal.communityRoles.enqueue, {
    discordUserId: stale.discordUserId,
  })
  assert.deepEqual(
    await f.t.mutation(internal.communityRoles.dispatch, {
      worker: "shard-owner",
      jobs: [{ id: stale.id, revision: stale.revision }],
    }),
    []
  )
  const prepared = await f.t.mutation(internal.communityRoles.claim, {
    worker: "recovery",
  })
  assert.ok(prepared.length > 0)
  now += 120001
  assert.deepEqual(
    await f.t.mutation(internal.communityRoles.dispatch, {
      worker: "recovery",
      jobs: prepared.map(({ id, revision }) => ({ id, revision })),
    }),
    []
  )
  assert.ok(
    (await f.t.mutation(internal.communityRoles.claim, { worker: "next" }))
      .length > 0
  )
})

test("eligibility skips entitlement fan-out for 100 ordinary or stale memberships", async () => {
  const f = await fixture(),
    now = Date.now()
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 100; i++) {
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: String(400000000000000000n + BigInt(i)),
        name: "Community",
        botInstallationVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert("discordGuildMemberships", {
        guildId,
        discordUserId,
        userId: f.userId,
        canManage: false,
        isOwner: false,
        permissions: "0",
        managementVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }
  })
  const { roleEligibility } = await import("./lib/cleoRoleEligibility")
  const counts: Record<string, number> = {}
  const result = await f.t.run((ctx) =>
    roleEligibility(
      {
        ...ctx,
        db: new Proxy(ctx.db, {
          get(db, property) {
            if (property === "query")
              return (table: Parameters<typeof db.query>[0]) => {
                counts[table] = (counts[table] ?? 0) + 1
                return db.query(table)
              }
            return Reflect.get(db, property)
          },
        }),
      },
      discordUserId
    )
  )
  assert.equal(result.communityManager, "notEligible")
  assert.equal(counts.guildSubscriptions ?? 0, 0)
  assert.equal(counts.guildEntitlementGrants ?? 0, 0)
  await f.t.run(async (ctx) => {
    for (const row of await ctx.db.query("discordGuildMemberships").collect())
      await ctx.db.patch(row._id, {
        permissions: "8",
        managementVerifiedAt: now - 300001,
      })
  })
  counts.guildSubscriptions = 0
  await f.t.run((ctx) =>
    roleEligibility(
      {
        ...ctx,
        db: new Proxy(ctx.db, {
          get(db, property) {
            if (property === "query")
              return (table: Parameters<typeof db.query>[0]) => {
                counts[table] = (counts[table] ?? 0) + 1
                return db.query(table)
              }
            return Reflect.get(db, property)
          },
        }),
      },
      discordUserId
    )
  )
  assert.equal(counts.guildSubscriptions, 0)
  await f.t.run(async (ctx) => {
    for (const row of await ctx.db.query("discordGuildMemberships").collect())
      await ctx.db.patch(row._id, { managementVerifiedAt: now })
  })
  counts.guildSubscriptions = 0
  counts.guildEntitlementGrants = 0
  const managers = await f.t.run((ctx) =>
    roleEligibility(
      {
        ...ctx,
        db: new Proxy(ctx.db, {
          get(db, property) {
            if (property === "query")
              return (table: Parameters<typeof db.query>[0]) => {
                counts[table] = (counts[table] ?? 0) + 1
                return db.query(table)
              }
            return Reflect.get(db, property)
          },
        }),
      },
      discordUserId
    )
  )
  assert.equal(managers.communityManager, "eligible")
  assert.equal(counts.guildSubscriptions, 300)
  assert.equal(counts.guildEntitlementGrants, 100)
})

test("due reconciliation excludes historical subscriptions and revoked Linked Roles", async () => {
  const f = await fixture()
  await f.activate()
  await f.t.run(async (ctx) => {
    const live = (await ctx.db.query("guildSubscriptions").first())!
    const { _id, _creationTime, ...fields } = live
    for (let i = 0; i < 220; i++) {
      await ctx.db.insert("guildSubscriptions", {
        ...fields,
        stripeSubscriptionId: `sub_history_${i}`,
        status: i % 2 ? "canceled" : "revoked",
        nextReconcileAt: undefined,
      })
      await ctx.db.insert("discordRoleConnections", {
        userId: f.userId,
        discordUserId,
        encryptedTokens: "",
        expiresAt: 0,
        revision: 1,
        revokedAt: Date.now() - 10000,
        updatedAt: 0,
      })
    }
    await ctx.db.patch(_id, { nextReconcileAt: Date.now() - 1 })
    await ctx.db.insert("discordRoleConnections", {
      userId: f.userId,
      discordUserId,
      encryptedTokens: "fixture",
      expiresAt: Date.now() + 3600000,
      revision: 1,
      updatedAt: Date.now() - 300001,
    })
  })
  assert.deepEqual(
    (await f.t.mutation(internal.premiumPurchases.reconciliationPage, {})).ids,
    ["sub_one"]
  )
  assert.deepEqual(
    (await f.t.mutation(internal.premiumPurchases.reconciliationPage, {})).ids,
    []
  )
  const before = (
    await f.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    )
  ).length
  await f.t.mutation(internal.discordConnections.reconcile, {})
  await f.t.mutation(internal.discordConnections.reconcile, {})
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect()
      )
    ).length,
    before + 1
  )
})

test("legacy subscription backfill is repeatable and verified expiry stops recurring reconciliation", async () => {
  const f = await fixture()
  await f.activate()
  const row = (await f.t.run((ctx) =>
    ctx.db.query("guildSubscriptions").first()
  ))!
  await f.t.run((ctx) => ctx.db.patch(row._id, { nextReconcileAt: undefined }))
  await f.t.mutation(internal.premiumPurchases.backfillReconciliation, {})
  assert.deepEqual(
    (await f.t.mutation(internal.premiumPurchases.reconciliationPage, {})).ids,
    ["sub_one"]
  )
  await f.activate({
    eventId: "expired",
    endsAt: Date.now() - 1,
    paidInvoice: undefined,
  })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(row._id)))?.nextReconcileAt,
    null
  )
  await f.t.mutation(internal.premiumPurchases.backfillReconciliation, {})
  assert.deepEqual(
    (await f.t.mutation(internal.premiumPurchases.reconciliationPage, {})).ids,
    []
  )
})

for (const coverage of ["paid", "grant", "expired", "concurrent"] as const)
  test(`activation coverage is complete beyond 100 historical ${coverage} records`, async () => {
    const f = await fixture(),
      now = Date.now()
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("paidCommunityActivations", {
          subscriptionId: `old-${i}`,
          guildId: f.guildId,
          userId: f.userId,
          discordUserId,
          purchaserKind: "owner",
          announce: false,
          displayRole: false,
          paidUntil: now,
          revoked: true,
          firstPaidInvoiceId: `old-in-${i}`,
          updatedAt: now,
          testMode: false,
        })
        await ctx.db.insert("guildEntitlementGrants", {
          grantKey: `old-grant-${i}`,
          guildId: f.guildId,
          discordGuildId,
          category: "complimentary",
          capabilities: [...CLEO_GUILD_CAPABILITIES],
          startsAt: now - 10000,
          endsAt: now,
          issuedBy: f.userId,
          reason: "Expired fixture",
          createdAt: now - 10000,
        })
      }
      if (coverage === "paid")
        await ctx.db.insert("paidCommunityActivations", {
          subscriptionId: "current-other",
          guildId: f.guildId,
          userId: f.userId,
          discordUserId,
          purchaserKind: "owner",
          announce: false,
          displayRole: false,
          paidUntil: now + 100000,
          revoked: false,
          firstPaidInvoiceId: "current-other",
          updatedAt: now,
          testMode: false,
        })
      if (coverage === "grant")
        await ctx.db.insert("guildEntitlementGrants", {
          grantKey: "current-grant",
          guildId: f.guildId,
          discordGuildId,
          category: "complimentary",
          capabilities: [...CLEO_GUILD_CAPABILITIES],
          startsAt: now - 10000,
          endsAt: now + 100000,
          issuedBy: f.userId,
          reason: "Active fixture",
          createdAt: now - 10000,
        })
    })
    if (coverage === "concurrent")
      await Promise.all([
        f.activate(),
        f.activate({ subscriptionId: "sub_two", eventId: "paid-two" }),
      ])
    else await f.activate()
    const outbox = await f.t.run((ctx) =>
      ctx.db.query("communityAnnouncementOutbox").collect()
    )
    assert.equal(
      outbox.length,
      coverage === "paid" || coverage === "grant" ? 0 : 1
    )
  })

for (const purchaserKind of ["owner", "administrator"] as const)
  test(`announcement actions verify channel ownership, sanitized names and mentions for ${purchaserKind}`, async (t) => {
    const f = await fixture()
    await f.t.run((ctx) => ctx.db.patch(f.reservation._id, { purchaserKind }))
    await f.activate()
    await f.t.mutation(internal.premiumPurchases.communityConsent, {
      discordGuildId,
      publishIdentity: true,
    })
    let correctChannel = false
    const posts: Record<string, unknown>[] = []
    fetchFixture(t, async (input, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)))
        return Response.json({ id: "message-one" })
      }
      return Response.json({
        guild_id: correctChannel
          ? process.env.CLEO_OFFICIAL_GUILD_ID
          : discordGuildId,
      })
    })
    await assert.rejects(
      f.t.action(internal.recognitionActions.deliver, {}),
      /official server/
    )
    assert.equal(posts.length, 0)
    correctChannel = true
    await f.t.action(internal.recognitionActions.deliver, {})
    assert.equal(posts.length, 1)
    assert.deepEqual(posts[0]!.allowed_mentions, {
      parse: [],
      users: [discordUserId],
    })
    assert.equal(posts[0]!.enforce_nonce, true)
    assert.match(String(posts[0]!.nonce), /^[a-f0-9]{24}$/)
    assert.equal(
      posts[0]!.nonce,
      createHash("sha256")
        .update("premium:sub_one:in_one")
        .digest("hex")
        .slice(0, 24)
    )
    assert.ok(!String(posts[0]!.content).includes("@everyone"))
    assert.ok(!String(posts[0]!.content).includes("**"))
    assert.ok(!String(posts[0]!.content).includes("\u202e"))
    assert.match(
      String(posts[0]!.content),
      purchaserKind === "owner"
        ? /just upgraded their community/
        : /just sponsored Cleo Premium/
    )
    assert.ok(!String(posts[0]!.content).includes("on behalf of"))
    await f.t.action(internal.recognitionActions.deliver, {})
    assert.equal(posts.length, 1)
  })

test("an unpaid subscription snapshot cannot suppress its own first paid activation", async () => {
  const f = await fixture()
  await f.activate({ paidInvoice: undefined })
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.query("communityAnnouncementOutbox").collect()
      )
    ).length,
    0
  )
  await f.activate({ eventId: "first-paid" })
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.query("communityAnnouncementOutbox").collect()
      )
    ).length,
    1
  )
})

for (const privacy of ["community", "purchaser", "test-payment"] as const)
  test(`announcement delivery suppresses ${privacy} without a POST`, async (t) => {
    const f = await fixture()
    await f.activate({ testMode: privacy === "test-payment" })
    await f.t.mutation(internal.premiumPurchases.communityConsent, {
      discordGuildId,
      publishIdentity: privacy !== "community",
    })
    if (privacy === "purchaser")
      await f.t.run(async (ctx) => {
        const row = (await ctx.db.query("paidCommunityActivations").first())!
        await ctx.db.patch(row._id, { announce: false })
      })
    let posts = 0
    fetchFixture(t, async (_input, init) => {
      if (init?.method === "POST") posts++
      return Response.json({ guild_id: process.env.CLEO_OFFICIAL_GUILD_ID })
    })
    await f.t.action(internal.recognitionActions.deliver, {})
    assert.equal(posts, 0)
    assert.equal(
      (
        await f.t.run((ctx) =>
          ctx.db.query("communityAnnouncementOutbox").first()
        )
      )?.state,
      "suppressed"
    )
  })

test("ambiguous announcement sends never replay and unmatched batches do not starve later recovery", async (t) => {
  const f = await fixture()
  await f.activate()
  await f.t.mutation(internal.premiumPurchases.communityConsent, {
    discordGuildId,
    publishIdentity: true,
  })
  let posts = 0,
    channelValid = true
  const messages: {
    id: string
    author: { id: string }
    embeds: { footer: { text: string } }[]
  }[] = []
  fetchFixture(t, async (input, init) => {
    if (init?.method === "POST") {
      posts++
      throw new Error("ambiguous transport result")
    }
    if (String(input).endsWith("/users/@me"))
      return Response.json({ id: "bot", bot: true })
    if (String(input).includes("messages?")) return Response.json(messages)
    return Response.json({
      guild_id: channelValid
        ? process.env.CLEO_OFFICIAL_GUILD_ID
        : discordGuildId,
    })
  })
  await f.t.action(internal.recognitionActions.deliver, {})
  await f.t.action(internal.recognitionActions.deliver, {})
  assert.equal(posts, 1)
  const original = (await f.t.run((ctx) =>
    ctx.db.query("communityAnnouncementOutbox").first()
  ))!
  const { digestIntegrationValue } = await import("./lib/integrationSecurity")
  const footer = {
    text: `Cleo recognition ${digestIntegrationValue(original.key).slice(0, 24)}`,
  }
  messages.push({ id: "forged", author: { id: "human" }, embeds: [{ footer }] })
  channelValid = false
  await assert.rejects(
    f.t.action(internal.recognitionActions.reconcile, {}),
    /official server/
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(original._id)))?.state,
    "uncertain"
  )
  channelValid = true
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 25; i++)
      await ctx.db.insert("communityAnnouncementOutbox", {
        activationId: original.activationId,
        key: `uncertain-${i}`,
        state: "uncertain",
        updatedAt: Date.now(),
      })
  })
  await f.t.action(internal.recognitionActions.reconcile, {})
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(original._id)))?.state,
    "investigation"
  )
  const tail = (
    await f.t.query(internal.communityRecognition.uncertain, {})
  ).at(-1)!
  messages.push({
    id: "verified",
    author: { id: "bot" },
    embeds: [
      {
        footer: {
          text: `Cleo recognition ${digestIntegrationValue(tail.key).slice(0, 24)}`,
        },
      },
    ],
  })
  await f.t.action(internal.recognitionActions.reconcile, {})
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(tail._id)))?.messageId,
    "verified"
  )
  assert.equal(
    (await f.t.query(internal.communityRecognition.uncertain, {})).length,
    0
  )
  assert.equal(posts, 1)
})

for (const revokeFails of [false, true])
  test(`mismatched OAuth grant is revoked before rejection, revoke failure=${revokeFails}`, async (t) => {
    const f = await fixture()
    let revokes = 0,
      exchanges = 0
    fetchFixture(t, async (input) => {
      const url = String(input)
      if (url.endsWith("/oauth2/token/revoke")) {
        revokes++
        return new Response(null, { status: revokeFails ? 503 : 204 })
      }
      if (url.endsWith("/oauth2/token")) {
        exchanges++
        return Response.json({
          access_token: "private-access",
          refresh_token: "private-refresh",
          token_type: "Bearer",
          scope: "identify role_connections.write",
          expires_in: 3600,
        })
      }
      return Response.json({ id: "222222222222222222" })
    })
    const state = new URL(
      await f.alice.action(api.communityActions.beginLinkedRoles, {})
    ).searchParams.get("state")!
    await assert.rejects(
      f.alice.action(api.communityActions.finishLinkedRoles, {
        code: "code",
        state,
      }),
      /identity linked/
    )
    assert.equal(revokes, 1)
    assert.equal(
      await f.t.query(internal.discordConnections.connection, {
        userId: f.userId,
      }),
      null
    )
    await assert.rejects(
      f.alice.action(api.communityActions.finishLinkedRoles, {
        code: "code",
        state,
      }),
      /Invalid or expired/
    )
    assert.equal(exchanges, 1)
  })

test("signed unrelated refunds acknowledge; incomplete known evidence retries and recognised reversals stay sticky", async (t) => {
  const f = await fixture()
  await f.activate()
  let unknownCustomer = "cus_unrelated"
  fetchFixture(t, async (input) => {
    const url = String(input)
    if (url.includes("/charges/"))
      return Response.json({
        id: url.split("/").at(-1),
        customer: unknownCustomer,
      })
    return Response.json({
      id: "sub_one",
      customer: "cus_alice",
      status: "active",
      metadata: { cleo_checkout: f.reservation.key },
      cancel_at_period_end: false,
      latest_invoice: null,
      items: {
        data: [
          {
            current_period_start: Math.floor(f.apply.startsAt / 1000),
            current_period_end: Math.floor(f.apply.endsAt / 1000),
            price: { id: "price_premium", product: "prod_premium" },
          },
        ],
      },
    })
  })
  async function webhook(id: string, type: string, object: unknown) {
    const body = JSON.stringify({
        id,
        type,
        livemode: false,
        data: { object },
      }),
      timestamp = String(Math.floor(Date.now() / 1000))
    return f.t.action(internal.premiumActions.webhook, {
      body,
      signature: `t=${timestamp},v1=${createHmac("sha256", "whsec_fixture").update(`${timestamp}.${body}`).digest("hex")}`,
    })
  }
  for (const type of [
    "charge.refunded",
    "charge.dispute.created",
    "charge.dispute.closed",
  ]) {
    assert.equal(
      await webhook(`unknown-${type}`, type, {
        id: "ch_unknown",
        charge: "ch_unknown",
      }),
      true
    )
    assert.equal(
      await webhook(`unknown-${type}`, type, {
        id: "ch_unknown",
        charge: "ch_unknown",
      }),
      true
    )
  }
  unknownCustomer = "cus_alice"
  await assert.rejects(
    webhook("early-known", "charge.refunded", { id: "ch_not_yet_recorded" }),
    /association requires reconciliation/
  )
  await webhook("known", "charge.refunded", { id: "ch_one" })
  await webhook("known", "charge.refunded", { id: "ch_one" })
  await webhook("reordered", "customer.subscription.updated", { id: "sub_one" })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("guildSubscriptions").first()))
      ?.status,
    "revoked"
  )
})
