import assert from "node:assert/strict"
import { generateKeyPairSync, randomUUID } from "node:crypto"
import { test } from "node:test"
import { ConvexError } from "convex/values"
import { SignJWT, exportJWK } from "jose"
import { convexTest } from "convex-test"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import {
  catalogueChange,
  requireCatalogueSessionClaims,
} from "./lib/billingCatalogueModels"

process.env.STRIPE_SECRET_KEY = "sk_test_fixture"
process.env.STRIPE_EXPECTED_ACCOUNT_ID = "acct_1RGgwvE1e1YdqDQQ"
process.env.STRIPE_CATALOGUE_WRITES_ENABLED = "true"
process.env.STRIPE_CATALOGUE_MANAGER_IDS = "finance"
process.env.CLEO_DASHBOARD_ORIGIN = "https://review.example.com"
process.env.CLERK_JWT_ISSUER_DOMAIN = "https://catalogue.clerk.accounts.dev"
const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./billingCatalogue.ts": () => import("./billingCatalogue"),
  "./billingCatalogueActions.ts": () => import("./billingCatalogueActions"),
}
async function fixture() {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    for (const [clerkUserId, role] of [
      ["finance", "admin"],
      ["staff", "staff"],
      ["admin", "admin"],
      ["ordinary", "user"],
    ] as const)
      await ctx.db.insert("users", {
        clerkUserId,
        role,
        email: `${clerkUserId}@example.com`,
        createdAt: 1,
        updatedAt: 1,
      })
  })
  return {
    t,
    finance: t.withIdentity({ subject: "finance", sid: "session_finance" }),
  }
}
test("financial authority requires the explicit capability as well as admin status", async () => {
  const f = await fixture()
  await assert.rejects(
    f.t.query(internal.billingCatalogue.authority, { write: true }),
    /signed in/
  )
  for (const subject of ["staff", "admin", "ordinary"]) {
    const user = f.t.withIdentity({ subject })
    await assert.rejects(
      user.query(internal.billingCatalogue.authority, { write: true }),
      /Financial management/
    )
    assert.equal(
      (await user.query(api.billingCatalogue.access, {})).canWrite,
      false
    )
  }
  assert.equal(
    (await f.finance.query(api.billingCatalogue.access, {})).canWrite,
    true
  )
  assert.equal(
    (
      await f.t
        .withIdentity({ subject: "ordinary" })
        .query(api.billingCatalogue.access, {})
    ).canRead,
    false
  )
})
test("operation reservations bind actor, account and exact terms and preserve ambiguous writes", async () => {
  const f = await fixture()
  const args = {
    key: "operation",
    request: '{"kind":"createProduct"}',
    accountId: process.env.STRIPE_EXPECTED_ACCOUNT_ID!,
    worker: "one",
  }
  assert.equal(
    await f.finance.mutation(internal.billingCatalogue.claim, args),
    "first"
  )
  await assert.rejects(
    f.finance.mutation(internal.billingCatalogue.claim, {
      ...args,
      worker: "two",
    }),
    /already processing/
  )
  await assert.rejects(
    f.finance.mutation(internal.billingCatalogue.claim, {
      ...args,
      request: "changed",
    }),
    /different terms/
  )
  await assert.rejects(
    f.finance.mutation(internal.billingCatalogue.complete, {
      key: args.key,
      worker: "two",
      outcome: { result: "prod_one" },
    }),
    /authority expired/
  )
  await f.finance.mutation(internal.billingCatalogue.complete, {
    key: args.key,
    worker: "one",
    outcome: { result: "prod_one" },
  })
  assert.deepEqual(
    await f.finance.mutation(internal.billingCatalogue.claim, args),
    { result: "prod_one" }
  )
  const history = await f.finance.query(api.billingCatalogue.history, {})
  assert.equal(history.length, 1)
  assert.ok(history[0]?.completedAt)
  assert.equal(history[0]?.canRetry, true)
  const otherStaff = await f.t
    .withIdentity({ subject: "staff" })
    .query(api.billingCatalogue.history, {})
  assert.equal(otherStaff[0]?.canRetry, false)
})
test("freshness checks reject other users, sessions, stale factors, future issuance and missing claims", () => {
  const now = Math.floor(Date.now() / 1000)
  const identity = { clerkUserId: "finance", sessionId: "session_finance" }
  const claims = {
    sub: identity.clerkUserId,
    sid: identity.sessionId,
    iat: now,
    exp: now + 60,
    fva: [0, -1],
    azp: "https://review.example.com",
  }
  requireCatalogueSessionClaims(claims, identity, now, [
    "https://review.example.com",
  ])
  for (const patch of [
    { azp: "https://other.example.com" },
    { azp: undefined },
    { sub: "another" },
    { sid: "other" },
    { fva: [5, -1] },
    { fva: [0, 5] },
    { fva: undefined },
    { iat: now - 91 },
    { iat: now + 6 },
    { exp: now },
  ])
    assert.throws(
      () =>
        requireCatalogueSessionClaims({ ...claims, ...patch }, identity, now, [
          "https://review.example.com",
        ]),
      /Sign in again/
    )
  assert.equal(
    catalogueChange.safeParse({
      kind: "createPrice",
      productId: "prod_one",
      amount: -1,
      currency: "gbp",
      interval: "month",
      intervalCount: 1,
    }).success,
    false
  )
  assert.equal(
    catalogueChange.safeParse({
      kind: "createPrice",
      productId: "prod_one",
      amount: 499,
      currency: "gbp",
      interval: "year",
      intervalCount: 4,
    }).success,
    false
  )
})

test("an unresolved operation survives recent-history truncation and fences a different key", async () => {
  const f = await fixture()
  const args = {
    key: "uncertain",
    request: "{}",
    accountId: process.env.STRIPE_EXPECTED_ACCOUNT_ID!,
    worker: "one",
  }
  await f.finance.mutation(internal.billingCatalogue.claim, args)
  await f.t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", "finance"))
      .unique()
    assert.ok(user)
    for (let i = 0; i < 35; i++)
      await ctx.db.insert("billingCatalogueOperations", {
        ...args,
        key: `newer${i}`,
        userId: user._id,
        createdAt: Date.now() + i + 1,
        completedAt: Date.now(),
        result: "prod_done",
        leaseUntil: 0,
      })
  })
  assert.ok(
    (await f.finance.query(api.billingCatalogue.history, {})).some(
      (row) => row.key === "uncertain" && row.canRetry && !row.completedAt
    )
  )
  await assert.rejects(
    f.finance.mutation(internal.billingCatalogue.claim, {
      ...args,
      key: "different",
    }),
    /Resolve the recorded operation/
  )
})

test("requested price approvals remain correct beyond 500 retained mappings", async () => {
  const f = await fixture()
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 505; i++)
      await ctx.db.insert("guildBillingPrices", {
        stripeProductId: "prod_one",
        stripePriceId: `price_${i}`,
        enabled: true,
        updatedAt: 1,
      })
  })
  assert.deepEqual(
    await f.finance.query(internal.billingCatalogue.mappings, {
      productId: "prod_one",
      priceIds: ["price_504"],
    }),
    [{ productId: "prod_one", priceId: "price_504" }]
  )
})
test("signed sandbox creation replays once, validates account and keeps historical mappings when archiving", async (t) => {
  const f = await fixture()
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  })
  const jwk = await exportJWK(publicKey)
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    sid: "session_finance",
    fva: [0, -1],
    azp: "https://review.example.com",
  })
    .setSubject("finance")
    .setIssuer(process.env.CLERK_JWT_ISSUER_DOMAIN!)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .sign(privateKey)
  let posts = 0,
    mismatch = false
  const previous = globalThis.fetch
  t.after(() => {
    globalThis.fetch = previous
  })
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith("/.well-known/jwks.json"))
      return Response.json({ keys: [{ ...jwk, kid: "fixture", alg: "RS256" }] })
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer sk_test_fixture"
    )
    if (url.endsWith("/account"))
      return Response.json({
        id: mismatch ? "acct_wrong" : process.env.STRIPE_EXPECTED_ACCOUNT_ID,
      })
    if (init?.method === "POST") {
      posts++
      assert.ok(new Headers(init.headers).get("Idempotency-Key"))
    }
    return Response.json({
      id: "prod_one",
      name: "Server Premium",
      description: "",
      active: init?.method !== "POST" || url.endsWith("/products"),
      livemode: false,
      default_price: null,
    })
  }
  const args = {
    key: "6c4266c4-a4a9-4d89-9be5-4cd3eb4ba25e",
    request: JSON.stringify({
      kind: "createProduct",
      name: "Server Premium",
      description: "",
    }),
    sessionToken: token,
    confirmation: "CONFIRM SANDBOX CHANGE",
  }
  assert.equal(
    await f.finance.action(api.billingCatalogueActions.change, args),
    "prod_one"
  )
  assert.equal(
    await f.finance.action(api.billingCatalogueActions.change, args),
    "prod_one"
  )
  assert.equal(posts, 1)
  mismatch = true
  await assert.rejects(
    f.finance.action(api.billingCatalogueActions.change, args),
    /Dev Sandbox/
  )
  assert.equal(posts, 1)
  mismatch = false
  await f.t.run((ctx) =>
    ctx.db.insert("guildBillingPrices", {
      stripeProductId: "prod_one",
      stripePriceId: "price_old",
      enabled: true,
      updatedAt: 1,
    })
  )
  await f.finance.action(api.billingCatalogueActions.change, {
    ...args,
    key: "aeed02e4-479d-40b5-b6da-289a08653a38",
    request: JSON.stringify({ kind: "archiveProduct", productId: "prod_one" }),
  })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("guildBillingPrices").unique()))
      ?.enabled,
    true
  )
  assert.equal(posts, 2)
})

test("recurring and one-time prices, defaults, mapping and archival preserve historical billing", async (t) => {
  const f = await fixture()
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  })
  const jwk = await exportJWK(publicKey)
  const token = await new SignJWT({
    sid: "session_finance",
    fva: [0, -1],
    azp: "https://review.example.com",
  })
    .setSubject("finance")
    .setIssuer(process.env.CLERK_JWT_ISSUER_DOMAIN!)
    .setIssuedAt()
    .setExpirationTime("1m")
    .setProtectedHeader({ alg: "RS256", kid: "price-fixture" })
    .sign(privateKey)
  const product = {
    id: "prod_one",
    name: "Premium",
    description: "",
    active: true,
    livemode: false,
    default_price: "price_old",
  }
  const recurring = {
    interval: "month",
    interval_count: 1,
    usage_type: "licensed",
  }
  const prices = new Map([
    [
      "price_old",
      {
        id: "price_old",
        product: product.id,
        active: true,
        livemode: false,
        unit_amount: 499,
        currency: "gbp",
        recurring,
      },
    ],
    [
      "price_new",
      {
        id: "price_new",
        product: product.id,
        active: true,
        livemode: false,
        unit_amount: 599,
        currency: "gbp",
        recurring,
      },
    ],
  ])
  const previous = globalThis.fetch
  const writes: string[] = []
  let accountFailure = false
  let failProductRead = false
  let holdAccount: (() => Promise<void>) | undefined
  t.after(() => {
    globalThis.fetch = previous
  })
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith("/.well-known/jwks.json"))
      return Response.json({ keys: [{ ...jwk, kid: "price-fixture" }] })
    if (url.pathname.endsWith("/account")) {
      if (accountFailure) throw new Error("Account lookup failed")
      await holdAccount?.()
      return Response.json({ id: process.env.STRIPE_EXPECTED_ACCOUNT_ID })
    }
    const fields = new URLSearchParams(String(init?.body ?? ""))
    if (init?.method === "POST") writes.push(url.pathname)
    if (url.pathname === "/v1/prices") {
      if (fields.get("currency") === "zzz")
        return Response.json(
          { error: { type: "invalid_request_error", param: "currency" } },
          { status: 400 }
        )
      if (fields.get("currency") === "usd")
        throw new Error("Response lost after dispatch")
      assert.equal(fields.get("product"), product.id)
      assert.equal(fields.get("unit_amount"), "599")
      return Response.json({
        ...prices.get("price_new"),
        recurring: fields.has("recurring[interval]") ? recurring : null,
      })
    }
    if (url.pathname.endsWith(`/products/${product.id}`)) {
      if (failProductRead) throw new Error("Product lookup failed")
      if (fields.has("default_price"))
        product.default_price = fields.get("default_price")!
      if (fields.has("name")) product.name = fields.get("name")!
      return Response.json(product)
    }
    const price = prices.get(url.pathname.split("/").at(-1)!)
    if (price) {
      if (fields.get("active") === "false") price.active = false
      return Response.json(price)
    }
    throw new Error(`Unexpected catalogue endpoint ${url.pathname}`)
  }
  const run = (request: object, key = randomUUID()) =>
    f.finance.action(api.billingCatalogueActions.change, {
      key,
      request: JSON.stringify(request),
      sessionToken: token,
      confirmation: "CONFIRM SANDBOX CHANGE",
    })
  await f.t.run((ctx) =>
    ctx.db.insert("guildBillingPrices", {
      stripeProductId: product.id,
      stripePriceId: "price_old",
      enabled: true,
      updatedAt: 1,
    })
  )
  const createPrice = {
    kind: "createPrice",
    productId: product.id,
    amount: 599,
    currency: "gbp",
    interval: "month",
    intervalCount: 1,
  }
  const rejected = (error: unknown) =>
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    error.data.code === "CATALOGUE_NOT_SUBMITTED"
  const rejectedKey = randomUUID()
  await assert.rejects(
    run({ ...createPrice, currency: "zzz" }, rejectedKey),
    rejected
  )
  assert.equal(writes.length, 1)
  await assert.rejects(
    run({ ...createPrice, currency: "zzz" }, rejectedKey),
    rejected
  )
  assert.equal(writes.length, 1)

  const replayKey = randomUUID()
  let signalAccountReached!: () => void
  let resumeAccount!: () => void
  const accountReached = new Promise<void>((resolve) => {
    signalAccountReached = resolve
  })
  const accountResumed = new Promise<void>((resolve) => {
    resumeAccount = resolve
  })
  holdAccount = async () => {
    signalAccountReached()
    await accountResumed
  }
  const first = run(createPrice, replayKey)
  await accountReached
  try {
    accountFailure = true
    await assert.rejects(
      run(createPrice, replayKey),
      (error: unknown) =>
        !rejected(error) && String(error).includes("Account lookup failed")
    )
  } finally {
    accountFailure = false
    holdAccount = undefined
    resumeAccount()
  }
  assert.equal(await first, "price_new")
  product.active = false
  assert.equal(await run(createPrice, replayKey), "price_new")
  assert.equal(writes.length, 2)
  const unsubmittedKey = randomUUID()
  await assert.rejects(run(createPrice, unsubmittedKey), rejected)
  product.active = true
  await assert.rejects(run(createPrice, unsubmittedKey), rejected)
  assert.equal(writes.length, 2)

  for (const interval of ["one_time", "month"])
    assert.equal(
      await run({
        kind: "createPrice",
        productId: product.id,
        amount: 599,
        currency: "gbp",
        interval,
        intervalCount: 1,
      }),
      "price_new"
    )
  await run({
    kind: "editProduct",
    productId: product.id,
    name: "Server Premium",
    description: "Current plan",
  })
  assert.equal(product.name, "Server Premium")
  await run({
    kind: "approvePremium",
    productId: product.id,
    priceId: "price_new",
  })
  await run({
    kind: "defaultPrice",
    productId: product.id,
    priceId: "price_new",
  })
  await assert.rejects(
    run({ kind: "archivePrice", productId: product.id, priceId: "price_new" }),
    /Choose another default/
  )
  await run({
    kind: "archivePrice",
    productId: product.id,
    priceId: "price_old",
  })
  const mappings = await f.t.run((ctx) =>
    ctx.db.query("guildBillingPrices").collect()
  )
  assert.equal(mappings.length, 2)
  assert.ok(mappings.every((row) => row.enabled))
  assert.equal(product.default_price, "price_new")
  assert.equal(prices.get("price_old")?.active, false)
  const uncertainKey = randomUUID()
  const uncertain = { ...createPrice, currency: "usd" }
  await assert.rejects(run(uncertain, uncertainKey), /needs reconciliation/)
  await assert.rejects(run(createPrice), /Resolve the recorded operation/)
  await f.t.run(async (ctx) => {
    const operation = (
      await ctx.db.query("billingCatalogueOperations").collect()
    ).find((row) => row.key === uncertainKey)
    assert.ok(operation)
    await ctx.db.patch(operation._id, { leaseUntil: 0 })
  })
  failProductRead = true
  const dispatched = writes.length
  await assert.rejects(run(uncertain, uncertainKey), /needs reconciliation/)
  assert.equal(writes.length, dispatched)
  await assert.rejects(run(createPrice), /Resolve the recorded operation/)
  assert.ok(
    writes.every(
      (path) => path.startsWith("/v1/prices") || path.startsWith("/v1/products")
    )
  )
})
