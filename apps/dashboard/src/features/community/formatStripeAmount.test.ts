import assert from "node:assert/strict"
import { test } from "node:test"
import { formatStripeAmount } from "./formatStripeAmount"

test("Stripe amounts preserve two, zero and three decimal currencies and legacy API units", () => {
  assert.equal(formatStripeAmount(499, "gbp", "en-GB"), "£4.99")
  assert.equal(formatStripeAmount(500, "jpy", "en-GB"), "JP¥500")
  assert.match(formatStripeAmount(1234, "kwd", "en-GB"), /1\.234/)
  assert.match(formatStripeAmount(500, "isk", "en-GB"), /5$/)
  assert.match(formatStripeAmount(500, "ugx", "en-GB"), /5$/)
})
