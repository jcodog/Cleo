import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { api } from "./_generated/api"
import { stripeBillingUrl } from "./lib/billingPortalModels"

process.env.STRIPE_EXPECTED_ACCOUNT_ID = "acct_fixture"
process.env.STRIPE_SECRET_KEY = "sk_test_fixture"
process.env.STRIPE_TEST_CHECKOUT_ENABLED = "false"
process.env.CLEO_DASHBOARD_ORIGIN = "https://dashboard.example"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./billingPortalActions.ts": () => import("./billingPortalActions"),
  "./premiumPurchases.ts": () => import("./premiumPurchases"),
  "./mutations/internal/guildBilling.ts": () =>
    import("./mutations/internal/guildBilling"),
}
const key = "f60ad7cc-c959-4f01-a621-edb0f7831bb7"
const card = {
  id: "pm_alice",
  customer: "cus_alice",
  livemode: false,
  type: "card",
  card: {
    brand: "visa",
    last4: "4242",
    exp_month: 12,
    exp_year: 2030,
    fingerprint: "never-return-this",
  },
}
const customer = {
  id: "cus_alice",
  livemode: false,
  name: "Alice Billing",
  email: "billing@example.com",
  address: {
    line1: "1 Test Street",
    line2: null,
    city: "Test City",
    state: null,
    postal_code: "SW1A 1AA",
    country: "GB",
  },
  invoice_settings: { default_payment_method: "pm_alice" },
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
    const bob = await ctx.db.insert("users", {
      clerkUserId: "bob",
      email: "bob@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("billingCustomers", {
      userId: alice,
      clerkUserId: "alice",
      stripeCustomerId: "cus_alice",
      createdAt: now,
    })
    return { alice, bob }
  })
  return {
    t,
    ...ids,
    payer: t.withIdentity({ subject: "alice" }),
    other: t.withIdentity({ subject: "bob" }),
  }
}
function transport(
  t: { after: (callback: () => void) => void },
  respond: (
    path: string,
    fields: URLSearchParams,
    init?: RequestInit
  ) => unknown
) {
  const previous = globalThis.fetch
  const requests: {
    path: string
    fields: URLSearchParams
    headers: Headers
    method: string
  }[] = []
  t.after(() => {
    globalThis.fetch = previous
  })
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.origin, "https://api.stripe.com")
    const path = url.pathname.replace(/^\/v1/, "") + url.search
    const fields = new URLSearchParams(String(init?.body ?? ""))
    requests.push({
      path,
      fields,
      headers: new Headers(init?.headers),
      method: init?.method ?? "GET",
    })
    if (path === "/account") return Response.json({ id: "acct_fixture" })
    return Response.json(respond(path, fields, init))
  }
  return requests
}

test("empty billing remains readable without creating a Stripe customer or requiring Discord authority", async (t) => {
  const f = await fixture()
  const calls = transport(t, () => {
    throw new Error("Unexpected Stripe request")
  })
  const result = await f.other.action(api.billingPortalActions.profile, {})
  assert.equal(result.clerkUserId, "bob")
  assert.equal(result.customer, null)
  assert.deepEqual(result.methods, [])
  assert.deepEqual(result.invoices, [])
  assert.equal(calls.length, 0)
  await assert.rejects(
    f.t.action(api.billingPortalActions.profile, {}),
    /signed in/
  )
  await f.t.run((ctx) => ctx.db.patch(f.alice, { status: "disabled" }))
  await assert.rejects(
    f.payer.action(api.billingPortalActions.profile, {}),
    /disabled/
  )
  assert.equal(calls.length, 0)
})

test("Stripe profile reads are purchaser-scoped, redacted and independent of checkout activation", async (t) => {
  const f = await fixture()
  const calls = transport(t, (path) => {
    if (
      path === "/customers/cus_alice" ||
      path.startsWith("/customers/cus_alice?")
    )
      return customer
    if (path.startsWith("/customers/cus_alice/payment_methods"))
      return {
        data: [
          card,
          {
            id: "pm_bank",
            customer: "cus_alice",
            livemode: false,
            type: "us_bank_account",
            us_bank_account: { last4: "6789", bank_name: "Test Bank" },
          },
        ],
        has_more: false,
      }
    if (path.startsWith("/invoices?customer=cus_alice"))
      return {
        data: [
          {
            id: "in_alice",
            customer: "cus_alice",
            livemode: false,
            number: "TEST-001",
            created: 1700000000,
            total: 499,
            currency: "gbp",
            status: "paid",
            hosted_invoice_url: "https://invoice.stripe.com/i/test",
            invoice_pdf: "https://attacker.example/invoice.pdf",
          },
        ],
        has_more: false,
      }
    if (path.startsWith("/subscriptions?customer=cus_alice"))
      return {
        data: [
          {
            id: "sub_alice",
            customer: "cus_alice",
            livemode: false,
            status: "active",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  current_period_end: 1800000000,
                  quantity: 1,
                  price: {
                    unit_amount: 499,
                    currency: "gbp",
                    recurring: { interval: "month", interval_count: 1 },
                    product: { name: "Cleo Server Premium" },
                  },
                },
              ],
            },
          },
        ],
        has_more: false,
      }
    throw new Error(`Unexpected request: ${path}`)
  })
  const result = await f.payer.action(api.billingPortalActions.profile, {})
  assert.equal(result.customer?.name, "Alice Billing")
  assert.equal(result.customer?.address.postalCode, "SW1A 1AA")
  assert.equal(result.customer?.defaultMethodId, "pm_alice")
  assert.equal(result.methods[0]?.last4, "4242")
  assert.equal(result.methods[1]?.last4, "6789")
  assert.ok(!JSON.stringify(result).includes("never-return-this"))
  assert.equal(result.invoices[0]?.pdf, null)
  assert.equal(result.subscriptions[0]?.items[0]?.amount, 499)
  assert.equal(result.subscriptions[0]?.status, "active")
  assert.ok(calls.every((call) => call.method === "GET"))
  assert.equal(
    await f.t.run((ctx) => ctx.db.query("guildSubscriptions").first()),
    null
  )
})

test("a foreign payment method or Stripe customer result cannot leak through the purchaser profile", async (t) => {
  const f = await fixture()
  transport(t, (path) =>
    path === "/customers/cus_alice" || path.startsWith("/customers/cus_alice?")
      ? customer
      : path.includes("/payment_methods")
        ? { data: [{ ...card, customer: "cus_bob" }], has_more: false }
        : { data: [], has_more: false }
  )
  await assert.rejects(
    f.payer.action(api.billingPortalActions.profile, {}),
    /identity could not be verified/
  )
})

test("Elements setup creates one bound customer and uses dynamic methods with stable idempotency", async (t) => {
  const f = await fixture()
  const calls = transport(t, (path, fields) => {
    if (path === "/customers") {
      assert.equal(fields.get("metadata[cleo_user]"), f.bob)
      return { id: "cus_bob", livemode: false }
    }
    if (path === "/setup_intents") {
      assert.equal(fields.get("customer"), "cus_bob")
      return {
        id: "seti_bob",
        customer: "cus_bob",
        livemode: false,
        client_secret: "setup_secret_fixture",
        status: "requires_payment_method",
        payment_method: null,
        metadata: { cleo_user: f.bob },
      }
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  for (let i = 0; i < 2; i++) {
    const result = await f.other.action(api.billingPortalActions.beginSetup, {
      key,
    })
    assert.equal(result.returnUrl, "https://dashboard.example/billing")
    assert.equal(result.id, "seti_bob")
  }
  assert.equal(calls.filter((call) => call.path === "/customers").length, 1)
  const setups = calls.filter((call) => call.path === "/setup_intents")
  assert.equal(
    setups[0]?.fields.get("automatic_payment_methods[enabled]"),
    "true"
  )
  assert.equal(setups[0]?.fields.get("usage"), "off_session")
  assert.equal(setups[0]?.fields.has("payment_method_types"), false)
  assert.equal(
    setups[0]?.headers.get("Idempotency-Key"),
    setups[1]?.headers.get("Idempotency-Key")
  )
  assert.equal(
    await f.t.run((ctx) => ctx.db.query("guildSubscriptions").first()),
    null
  )
})

test("setup completion trusts verified Stripe status and ownership, never a client success screen", async (t) => {
  const f = await fixture()
  let status = "processing",
    owner = f.alice,
    paymentCustomer = "cus_alice"
  const calls = transport(t, (path) => {
    if (path === "/setup_intents/seti_alice")
      return {
        id: "seti_alice",
        customer: "cus_alice",
        livemode: false,
        client_secret: null,
        status,
        payment_method: "pm_alice",
        metadata: { cleo_user: owner },
      }
    if (path === "/payment_methods/pm_alice")
      return { ...card, customer: paymentCustomer }
    if (
      path === "/customers/cus_alice" ||
      path.startsWith("/customers/cus_alice?")
    )
      return customer
    throw new Error(`Unexpected request: ${path}`)
  })
  assert.equal(
    await f.payer.action(api.billingPortalActions.completeSetup, {
      setupIntentId: "seti_alice",
    }),
    "processing"
  )
  assert.ok(calls.every((call) => call.method === "GET"))
  status = "requires_payment_method"
  await assert.rejects(
    f.payer.action(api.billingPortalActions.completeSetup, {
      setupIntentId: "seti_alice",
    }),
    /not been saved/
  )
  status = "succeeded"
  owner = f.bob
  await assert.rejects(
    f.payer.action(api.billingPortalActions.completeSetup, {
      setupIntentId: "seti_alice",
    }),
    /does not belong/
  )
  owner = f.alice
  paymentCustomer = "cus_bob"
  await assert.rejects(
    f.payer.action(api.billingPortalActions.completeSetup, {
      setupIntentId: "seti_alice",
    }),
    /does not belong/
  )
  paymentCustomer = "cus_alice"
  assert.equal(
    await f.payer.action(api.billingPortalActions.completeSetup, {
      setupIntentId: "seti_alice",
    }),
    "saved"
  )
  const writes = calls.filter((call) => call.method === "POST")
  assert.equal(writes.length, 1)
  assert.equal(
    writes[0]?.fields.get("invoice_settings[default_payment_method]"),
    "pm_alice"
  )
  assert.equal(
    await f.t.run((ctx) => ctx.db.query("paidCommunityActivations").first()),
    null
  )
})

test("default changes require a method owned by this customer and preserve subscription overrides", async (t) => {
  const f = await fixture()
  let owner = "cus_bob"
  const calls = transport(t, (path) =>
    path.startsWith("/payment_methods/")
      ? { ...card, customer: owner }
      : customer
  )
  await assert.rejects(
    f.payer.action(api.billingPortalActions.makeDefault, {
      paymentMethodId: "pm_alice",
      key,
    }),
    /does not belong/
  )
  assert.ok(calls.every((call) => call.method === "GET"))
  owner = "cus_alice"
  await f.payer.action(api.billingPortalActions.makeDefault, {
    paymentMethodId: "pm_alice",
    key,
  })
  assert.equal(calls.filter((call) => call.method === "POST").length, 1)
  assert.ok(!calls.some((call) => call.path.startsWith("/subscriptions/")))
})

test("removal protects defaults and active subscription methods, while canceled historical methods can be removed", async (t) => {
  const f = await fixture()
  let defaultId: string | null = "pm_alice",
    status = "active"
  const calls = transport(t, (path) => {
    if (path === "/payment_methods/pm_alice") return card
    if (path === "/customers/cus_alice")
      return {
        ...customer,
        invoice_settings: { default_payment_method: defaultId },
      }
    if (path.startsWith("/subscriptions?"))
      return {
        data: [
          { customer: "cus_alice", status, default_payment_method: "pm_alice" },
        ],
        has_more: false,
      }
    if (path.endsWith("/detach")) return { ...card, customer: null }
    throw new Error(`Unexpected request: ${path}`)
  })
  await assert.rejects(
    f.payer.action(api.billingPortalActions.removeMethod, {
      paymentMethodId: "pm_alice",
      key,
    }),
    /Choose another default/
  )
  defaultId = null
  await assert.rejects(
    f.payer.action(api.billingPortalActions.removeMethod, {
      paymentMethodId: "pm_alice",
      key,
    }),
    /subscription uses/
  )
  assert.ok(calls.every((call) => call.method === "GET"))
  status = "canceled"
  await f.payer.action(api.billingPortalActions.removeMethod, {
    paymentMethodId: "pm_alice",
    key,
  })
  assert.equal(calls.filter((call) => call.method === "POST").length, 1)
  assert.equal(calls.at(-1)?.path, "/payment_methods/pm_alice/detach")
})

test("billing detail edits are validated and update only the authenticated customer's invoice identity", async (t) => {
  const f = await fixture()
  const calls = transport(t, () => customer)
  const details = {
    key,
    name: "Updated Billing",
    email: "new@example.com",
    address: {
      line1: "2 Test Street",
      line2: "",
      city: "Test City",
      state: "",
      postalCode: "SW1A 1AA",
      country: "GB",
    },
  }
  await assert.rejects(
    f.payer.action(api.billingPortalActions.updateDetails, {
      ...details,
      email: "not-email",
    })
  )
  assert.equal(calls.length, 0)
  await f.payer.action(api.billingPortalActions.updateDetails, details)
  assert.equal(calls.at(-1)?.path, "/customers/cus_alice")
  assert.equal(calls.at(-1)?.fields.get("name"), "Updated Billing")
  assert.equal(calls.at(-1)?.fields.get("address[postal_code]"), "SW1A 1AA")
  assert.equal(calls.at(-1)?.fields.has("source"), false)
  assert.equal(
    calls.at(-1)?.fields.has("invoice_settings[default_payment_method]"),
    false
  )
})

test("unapproved return origins are rejected before creating a customer or SetupIntent", async (t) => {
  const f = await fixture()
  const calls = transport(t, () => {
    throw new Error("Unexpected write")
  })
  await assert.rejects(
    f.other.action(api.billingPortalActions.beginSetup, {
      key,
      returnOrigin: "https://attacker.example",
    }),
    /not configured for this dashboard address/
  )
  assert.equal(calls.length, 0)
})

test("setup cancellation verifies purchaser ownership and never cancels completed methods", async (t) => {
  const f = await fixture()
  let owner = f.bob,
    status = "requires_payment_method"
  const calls = transport(t, () => ({
    id: "seti_alice",
    customer: "cus_alice",
    livemode: false,
    client_secret: null,
    status,
    payment_method: null,
    metadata: { cleo_user: owner },
  }))
  await assert.rejects(
    f.payer.action(api.billingPortalActions.cancelSetup, {
      setupIntentId: "seti_alice",
    }),
    /does not belong/
  )
  owner = f.alice
  status = "succeeded"
  await f.payer.action(api.billingPortalActions.cancelSetup, {
    setupIntentId: "seti_alice",
  })
  assert.ok(calls.every((call) => call.method === "GET"))
  status = "requires_payment_method"
  await f.payer.action(api.billingPortalActions.cancelSetup, {
    setupIntentId: "seti_alice",
  })
  assert.equal(calls.at(-1)?.path, "/setup_intents/seti_alice/cancel")
})

test("legacy default sources remain visible instead of becoming a false empty payment state", async (t) => {
  const f = await fixture()
  transport(t, (path) =>
    path.startsWith("/customers/cus_alice?")
      ? {
          ...customer,
          invoice_settings: { default_payment_method: null },
          default_source: {
            id: "card_legacy",
            object: "card",
            brand: "visa",
            last4: "1234",
            exp_month: 12,
            exp_year: 2030,
          },
        }
      : { data: [], has_more: false }
  )
  const result = await f.payer.action(api.billingPortalActions.profile, {})
  assert.equal(result.customer?.defaultMethodId, "card_legacy")
  assert.equal(result.methods[0]?.last4, "1234")
  assert.equal(result.methods[0]?.manageable, false)
})

test("invoice links accept only valid Stripe HTTPS destinations", () => {
  for (const value of [
    null,
    "not-a-url",
    "https://attacker.example/invoice",
    "https://user:password@invoice.stripe.com/test",
    "http://invoice.stripe.com/test",
  ])
    assert.equal(stripeBillingUrl(value), null)
  assert.equal(
    stripeBillingUrl("https://invoice.stripe.com/i/test"),
    "https://invoice.stripe.com/i/test"
  )
})
