import assert from "node:assert/strict"
import { test } from "node:test"
import { ConvexError } from "convex/values"

Object.assign(process.env, {
  CLEO_DASHBOARD_ORIGIN: "https://dashboard.example",
  CLEO_DASHBOARD_ALLOWED_ORIGINS: "https://preview.example/path",
})

test("malformed origins use controlled billing errors and reject non-origin addresses", async () => {
  const { exactBillingOrigin } = await import("./billingOrigin")
  assert.equal(
    exactBillingOrigin("https://dashboard.example"),
    "https://dashboard.example"
  )
  for (const value of [
    "invalid",
    "http://dashboard.example",
    "https://dashboard.example/path",
    "https://dashboard.example?query",
    "https://dashboard.example#hash",
    "https://user:password@dashboard.example",
  ])
    assert.throws(
      () => exactBillingOrigin(value),
      (error) =>
        error instanceof ConvexError &&
        error.data === "Billing return address is invalid."
    )
})

test("billing diagnostics name the invalid origin setting and disable return URLs", async (t) => {
  const { billingConfiguration } = await import("./billingConfiguration")
  const { backendEnv } = await import("@workspace/env/backend")
  const invalidAllowlist = billingConfiguration()
  assert.equal(invalidAllowlist.returnOrigin, null)
  assert.ok(invalidAllowlist.missing.includes("CLEO_DASHBOARD_ALLOWED_ORIGINS"))
  assert.ok(!invalidAllowlist.missing.includes("CLEO_DASHBOARD_ORIGIN"))

  t.mock.property(
    backendEnv,
    "CLEO_DASHBOARD_ORIGIN",
    "https://dashboard.example/path"
  )
  const invalidCanonical = billingConfiguration()
  assert.equal(invalidCanonical.returnOrigin, null)
  assert.ok(invalidCanonical.missing.includes("CLEO_DASHBOARD_ORIGIN"))
})
