import assert from "node:assert/strict"
import { test } from "node:test"
import { createHmac, generateKeyPairSync, sign } from "node:crypto"
import { boundedWebhookBody } from "./boundedWebhookBody"
process.env.DISCORD_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
  "base64"
)

test("Discord signatures authenticate exact bytes and reject replay, tampering and malformed keys", async () => {
  const { verifyDiscordApplicationWebhook } =
    await import("./integrationSecurity")
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const key = publicKey
    .export({ type: "spki", format: "der" })
    .subarray(-32)
    .toString("hex")
  const body = '{"type":0}',
    timestamp = String(Math.floor(Date.now() / 1000)),
    now = Number(timestamp) * 1000
  const signature = sign(
    null,
    Buffer.from(timestamp + body),
    privateKey
  ).toString("hex")
  assert.equal(
    verifyDiscordApplicationWebhook(body, signature, timestamp, key, now),
    true
  )
  for (const [payload, sig, time, pub, clock] of [
    [body + " ", signature, timestamp, key, now],
    [body, signature, timestamp, key, now + 300001],
    [body, "x", timestamp, key, now],
    [body, signature, "NaN", key, now],
    [body, signature, timestamp, "x", now],
  ] as const)
    assert.equal(
      verifyDiscordApplicationWebhook(payload, sig, time, pub, clock),
      false
    )
})
test("Stripe verifies exact raw payload, timestamp and all rotated signatures", async () => {
  const { verifyStripeSignature } = await import("./integrationSecurity")
  const now = Date.now(),
    timestamp = String(Math.floor(now / 1000)),
    body = '{"id":"fixture"}'
  const mac = createHmac("sha256", "whsec_fixture")
    .update(`${timestamp}.${body}`)
    .digest("hex")
  const header = `t=${timestamp},v1=${"0".repeat(64)},v1=${mac}`
  assert.equal(verifyStripeSignature(body, header, "whsec_fixture", now), true)
  assert.equal(
    verifyStripeSignature(body + " ", header, "whsec_fixture", now),
    false
  )
  assert.equal(verifyStripeSignature(body, header, "wrong", now), false)
  assert.equal(
    verifyStripeSignature(body, header, "whsec_fixture", now + 301000),
    false
  )
  assert.equal(
    verifyStripeSignature(body, "t=bad,v1=x", "whsec_fixture", now),
    false
  )
  assert.equal(
    verifyStripeSignature(body, "x".repeat(8193), "whsec_fixture", now),
    false
  )
})
test("stored Discord tokens use authenticated encryption with unique nonces", async () => {
  const { encryptDiscordTokens, decryptDiscordTokens } =
    await import("./integrationSecurity")
  const token = '{"refresh_token":"sensitive-fixture"}'
  const a = encryptDiscordTokens(token),
    b = encryptDiscordTokens(token)
  assert.notEqual(a, b)
  assert.ok(!a.includes("sensitive-fixture"))
  assert.equal(decryptDiscordTokens(a), token)
  const parts = a.split(".")
  parts[1] = Buffer.alloc(16).toString("base64url")
  assert.throws(() => decryptDiscordTokens(parts.join(".")))
  assert.throws(() => decryptDiscordTokens("invalid"))
})
test("webhook body reader bounds chunked UTF-8 and rejects invalid bytes", async () => {
  assert.equal(
    await boundedWebhookBody(
      new Request("https://example.test", { method: "POST", body: "é" }),
      2
    ),
    "é"
  )
  assert.equal(
    await boundedWebhookBody(
      new Request("https://example.test", { method: "POST", body: "é" }),
      1
    ),
    null
  )
  assert.equal(
    await boundedWebhookBody(
      new Request("https://example.test", {
        method: "POST",
        body: new Uint8Array([255]),
      }),
      10
    ),
    null
  )
  assert.equal(
    await boundedWebhookBody(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-length": "11" },
        body: "x",
      }),
      10
    ),
    null
  )
})
test("paid support uses verified invoice line coverage, rejects trials, unrelated and incomplete invoices", async () => {
  const { stripeInvoice, invoicePaidUntil } = await import("./stripeCommunity")
  const invoice = stripeInvoice.parse({
    id: "in_fixture",
    paid: true,
    amount_paid: 1000,
    status: "paid",
    parent: { subscription_details: { subscription: "sub_one" } },
    period_end: 100,
    lines: {
      has_more: false,
      data: [
        {
          period: { start: 100, end: 200 },
          parent: { subscription_item_details: { subscription: "sub_one" } },
        },
      ],
    },
  })
  assert.equal(invoicePaidUntil(invoice, "sub_one", 400), 200000)
  assert.equal(invoicePaidUntil(invoice, "sub_one", 150), 150000)
  assert.equal(invoicePaidUntil(invoice, "sub_wrong", 400), undefined)
  assert.equal(
    invoicePaidUntil({ ...invoice, amount_paid: 0 }, "sub_one", 400),
    undefined
  )
  assert.equal(
    invoicePaidUntil(
      { ...invoice, lines: { ...invoice.lines, has_more: true } },
      "sub_one",
      400
    ),
    undefined
  )
  assert.equal(
    invoicePaidUntil(
      { ...invoice, lines: { has_more: false, data: [] } },
      "sub_one",
      400
    ),
    undefined
  )
})
