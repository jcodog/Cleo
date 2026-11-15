import assert from "node:assert/strict"
import { test } from "node:test"
import { backendFailureMessage } from "./BackendBoundary"

test("backend errors distinguish missing functions and rejected identity without displaying provider secrets", () => {
  assert.match(
    backendFailureMessage(
      new Error("Could not find public function for 'accountBilling:overview'.")
    ),
    /NEXT_PUBLIC_CONVEX_URL/
  )
  assert.match(
    backendFailureMessage(new Error("Unauthenticated OIDC token")),
    /same issuer/
  )
  const message = backendFailureMessage(
    new Error("provider secret-token-value unexpected error")
  )
  assert.match(message, /backend request failed/)
  assert.ok(!message.includes("secret-token-value"))
})
