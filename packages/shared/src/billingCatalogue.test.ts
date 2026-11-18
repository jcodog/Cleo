import assert from "node:assert/strict"
import { test } from "node:test"
import { catalogueChange } from "./billingCatalogue"

test("catalogue terms use the same three-year period bounds before confirmation and submission", () => {
  for (const [interval, intervalCount, valid] of [
    ["one_time", 36, true],
    ["day", 36, true],
    ["week", 36, true],
    ["month", 36, true],
    ["month", 37, false],
    ["year", 3, true],
    ["year", 4, false],
  ] as const)
    assert.equal(
      catalogueChange.safeParse({
        kind: "createPrice",
        productId: "prod_test",
        amount: 499,
        currency: "gbp",
        interval,
        intervalCount,
      }).success,
      valid
    )
})
