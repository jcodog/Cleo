import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { api } from "./_generated/api"

process.env.STRIPE_EXPECTED_ACCOUNT_ID = "acct_fixture"
process.env.STRIPE_SECRET_KEY = "sk_test_fixture"
process.env.STRIPE_TEST_CHECKOUT_ENABLED = "false"
process.env.CLEO_DASHBOARD_ORIGIN = "https://dashboard.example"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./accountBilling.ts": () => import("./accountBilling"),
  "./accountBillingActions.ts": () => import("./accountBillingActions"),
  "./premiumActions.ts": () => import("./premiumActions"),
  "./premiumPurchases.ts": () => import("./premiumPurchases"),
}
async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const now = Date.now()
    const alice = await ctx.db.insert("users", {
      clerkUserId: "alice",
      email: "alice@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("users", {
      clerkUserId: "bob",
      email: "bob@example.com",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    })
    const guild = await ctx.db.insert("guilds", {
      discordGuildId: "333333333333333333",
      name: "Piano Club",
      ownerDiscordId: "444444444444444444",
      createdAt: now,
      updatedAt: now,
    })
    const customer = await ctx.db.insert("billingCustomers", {
      userId: alice,
      clerkUserId: "alice",
      stripeCustomerId: "cus_alice",
      createdAt: now,
    })
    const subscription = {
      customerId: customer,
      guildId: guild,
      discordGuildId: "333333333333333333",
      stripeSubscriptionId: "sub_alice",
      stripeProductId: "prod_premium",
      stripePriceId: "price_premium",
      status: "active" as const,
      startsAt: now - 1000,
      endsAt: now + 3600000,
      cancelAtPeriodEnd: true,
      lastEventId: "evt_fixture",
      eventCreatedAt: now,
      revision: 1,
      reconciledAt: now,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert("guildSubscriptions", subscription)
    const recognition = await ctx.db.insert("paidCommunityActivations", {
      subscriptionId: "sub_alice",
      guildId: guild,
      userId: alice,
      discordUserId: "111111111111111111",
      purchaserKind: "administrator",
      announce: false,
      displayRole: true,
      paidUntil: now + 3600000,
      revoked: false,
      firstPaidInvoiceId: "in_fixture",
      updatedAt: now,
      testMode: true,
    })
    return { alice, guild, recognition, subscription }
  })
  return {
    t,
    ...ids,
    payer: t.withIdentity({ subject: "alice" }),
    other: t.withIdentity({ subject: "bob" }),
  }
}

test("personal billing is purchaser-scoped without requiring a Discord identity or guild membership", async () => {
  const f = await fixture()
  const result = await f.payer.query(api.accountBilling.overview, {})
  assert.equal(result.clerkUserId, "alice")
  assert.equal(result.canManageBilling, true)
  assert.equal(result.subscriptions[0]?.guildName, "Piano Club")
  assert.equal(result.subscriptions[0]?.cancelAtPeriodEnd, true)
  assert.deepEqual(result.subscriptions[0]?.recognition, {
    id: f.recognition,
    announce: false,
    displayRole: true,
    testMode: true,
  })
  assert.deepEqual(
    (await f.other.query(api.accountBilling.overview, {})).subscriptions,
    []
  )
  await assert.rejects(f.t.query(api.accountBilling.overview, {}), /signed in/)
  await f.t.run((ctx) => ctx.db.patch(f.alice, { status: "disabled" }))
  await assert.rejects(
    f.payer.query(api.accountBilling.overview, {}),
    /disabled/
  )
})

test("personal billing bounds results and survives an unavailable community", async () => {
  const f = await fixture()
  await f.t.run(async (ctx) => {
    for (let index = 0; index < 22; index++)
      await ctx.db.insert("guildSubscriptions", {
        ...f.subscription,
        stripeSubscriptionId: `sub_extra${index}`,
      })
    await ctx.db.delete(f.guild)
  })
  const result = await f.payer.query(api.accountBilling.overview, {})
  assert.equal(result.subscriptions.length, 20)
  assert.equal(result.hasMore, true)
  assert.ok(result.subscriptions.every((row) => row.guildName === null))
})

test("commercial Price reads and Portal sessions are bound to the purchaser, even while new checkout is disabled", async (t) => {
  const f = await fixture()
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  const requests: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith("/account")) return Response.json({ id: "acct_fixture" })
    if (url.endsWith("/billing_portal/sessions")) {
      const fields = new URLSearchParams(String(init?.body))
      assert.equal(fields.get("customer"), "cus_alice")
      assert.equal(
        fields.get("return_url"),
        "https://dashboard.example/account/billing"
      )
      return Response.json({
        url: "https://billing.stripe.com/session/fixture",
      })
    }
    assert.equal(
      url,
      "https://api.stripe.com/v1/prices/price_premium?expand[]=product"
    )
    return Response.json({
      id: "price_premium",
      livemode: false,
      unit_amount: 499,
      currency: "gbp",
      recurring: { interval: "month", interval_count: 1 },
      product: { name: "Cleo Server Premium" },
    })
  }
  assert.deepEqual(
    await f.other.action(api.accountBillingActions.prices, {}),
    []
  )
  assert.equal(requests.length, 0)
  assert.deepEqual(await f.payer.action(api.accountBillingActions.prices, {}), [
    {
      id: "price_premium",
      name: "Cleo Server Premium",
      amount: 499,
      currency: "gbp",
      interval: "month",
      intervalCount: 1,
    },
  ])
  assert.equal(
    await f.payer.action(api.premiumActions.portal, {}),
    "https://billing.stripe.com/session/fixture"
  )
  await assert.rejects(
    f.other.action(api.premiumActions.portal, {}),
    /customer is unavailable/
  )
})

test("billing diagnostics expose configuration names and mode without making ledger access depend on checkout", async () => {
  const f = await fixture()
  const result = await f.other.query(api.accountBilling.overview, {})
  assert.equal(result.configuration.stripeMode, "test")
  assert.equal(result.configuration.checkoutEnabled, false)
  assert.equal(result.subscriptions.length, 0)
  assert.ok(!JSON.stringify(result.configuration).includes("sk_test_fixture"))
})

test("purchaser price and Portal operations fail closed on another Stripe account", async (t) => {
  const f = await fixture()
  const previous = globalThis.fetch
  t.after(() => {
    globalThis.fetch = previous
  })
  const requests: string[] = []
  globalThis.fetch = async (input) => {
    requests.push(String(input))
    return Response.json({ id: "acct_wrong" })
  }
  await assert.rejects(
    f.payer.action(api.accountBillingActions.prices, {}),
    /does not match/
  )
  await assert.rejects(
    f.payer.action(api.premiumActions.portal, {}),
    /does not match/
  )
  assert.ok(requests.every((url) => url.endsWith("/account")))
})

test("existing checkout status and cancellation remain available while new test checkout is disabled", async (t) => {
  const f = await fixture()
  const now = Date.now()
  const expiresAt = Math.floor(now / 1000) + 3600
  await f.t.run((ctx) =>
    ctx.db.insert("premiumCheckouts", {
      guildId: f.guild,
      userId: f.alice,
      discordUserId: "111111111111111111",
      purchaserKind: "administrator",
      announce: false,
      displayRole: false,
      key: "recovery",
      sessionId: "cs_test_recovery",
      expiresAt: expiresAt * 1000,
      createdAt: now,
    })
  )
  const previous = globalThis.fetch
  t.after(() => {
    globalThis.fetch = previous
  })
  globalThis.fetch = async (input) =>
    String(input).endsWith("/expire")
      ? Response.json({ id: "cs_test_recovery", status: "expired" })
      : Response.json({
          id: "cs_test_recovery",
          customer: "cus_alice",
          livemode: false,
          mode: "subscription",
          ui_mode: "elements",
          status: "open",
          payment_status: "unpaid",
          client_secret: "test_session_secret",
          expires_at: expiresAt,
        })
  const args = {
    discordGuildId: "333333333333333333",
    sessionId: "cs_test_recovery",
  }
  assert.equal(
    (await f.payer.action(api.premiumActions.checkoutStatus, args)).status,
    "open"
  )
  assert.equal(
    await f.payer.action(api.premiumActions.cancelCheckout, args),
    "expired"
  )
})
