import assert from "node:assert/strict"
import { test } from "node:test"
import { ConvexError } from "convex/values"
import { exactBillingOrigin } from "./billingOrigin"

test("malformed origins use controlled billing errors and reject non-origin addresses", () => {
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
