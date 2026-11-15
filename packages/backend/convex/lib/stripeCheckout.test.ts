import assert from "node:assert/strict"
import { test } from "node:test"
import {
  checkoutSession,
  newCheckoutSession,
  hostedCheckoutUrl,
} from "./stripeCheckout"

test("legacy hosted sessions can be inspected and resumed but new sessions require Elements", () => {
  const legacy = {
    id: "cs_old",
    customer: "cus_owner",
    livemode: false,
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    expires_at: 1234,
    url: "https://checkout.stripe.com/c/pay/cs_old",
  }
  const session = checkoutSession.parse(legacy)
  assert.equal(session.ui_mode, "hosted")
  assert.equal(hostedCheckoutUrl(session), legacy.url)
  assert.equal(newCheckoutSession.safeParse(legacy).success, false)
  assert.equal(
    newCheckoutSession.safeParse({
      ...legacy,
      ui_mode: "elements",
      client_secret: "secret",
    }).success,
    true
  )
  for (const url of [
    "http://checkout.stripe.com/x",
    "https://checkout.stripe.com.evil.com/x",
    "https://user@checkout.stripe.com/x",
    "https://evil.com/x",
  ])
    assert.throws(() => hostedCheckoutUrl({ ...session, url }))
})
