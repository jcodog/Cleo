import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assertNonEmptyString,
  normalizeDiscordId,
  normalizeProviderAccountId,
} from "./ids"

test("assertNonEmptyString trims valid values", () => {
  assert.equal(assertNonEmptyString("  cleo  ", "Name"), "cleo")
})

test("assertNonEmptyString rejects blank values with the provided label", () => {
  assert.throws(
    () => assertNonEmptyString("   ", "Name"),
    /Name must not be empty/
  )
})

test("provider and Discord ID normalizers trim IDs", () => {
  assert.equal(normalizeProviderAccountId("  provider-id  "), "provider-id")
  assert.equal(normalizeDiscordId("  123456789012345678  "), "123456789012345678")
})
