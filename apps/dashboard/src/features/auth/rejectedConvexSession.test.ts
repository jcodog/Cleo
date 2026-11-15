import assert from "node:assert/strict"
import { test } from "node:test"
import { isRejectedConvexSession } from "./rejectedConvexSession"

test("only structured session rejections enter authentication recovery", () => {
  assert.equal(
    isRejectedConvexSession(
      new Error(
        JSON.stringify({
          code: "Unauthenticated",
          message: "Could not verify OIDC token claim.",
        })
      )
    ),
    true
  )
  assert.equal(
    isRejectedConvexSession(
      new Error("Clerk did not return a Convex authentication token")
    ),
    true
  )
  for (const failure of [
    null,
    "Unauthenticated",
    { code: "Unauthenticated" },
    new Error("Network unavailable"),
    new Error("Unauthenticated"),
    new Error('{"code":"Timeout"}'),
    new Error("[]"),
  ])
    assert.equal(isRejectedConvexSession(failure), false)
})
