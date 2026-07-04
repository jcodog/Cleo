import assert from "node:assert/strict"
import { test } from "node:test"

import { toOptionalChannelValue, toOptionalTextValue } from "./config"

test("optional configuration values trim input and clear blank values", () => {
  assert.equal(
    toOptionalChannelValue(" 123456789012345678 "),
    "123456789012345678"
  )
  assert.equal(toOptionalChannelValue("  "), null)
  assert.equal(toOptionalTextValue(" Welcome home "), "Welcome home")
  assert.equal(toOptionalTextValue(""), null)
})
