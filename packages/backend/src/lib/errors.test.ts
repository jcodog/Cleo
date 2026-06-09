import assert from "node:assert/strict"
import { test } from "node:test"

import { CleoBackendError, toErrorMessage, toErrorStack } from "./errors"

test("CleoBackendError stores code and cause", () => {
  const cause = new Error("inner")
  const error = new CleoBackendError("outer", {
    code: "OUTER",
    cause,
  })

  assert.equal(error.name, "CleoBackendError")
  assert.equal(error.message, "outer")
  assert.equal(error.code, "OUTER")
  assert.equal(error.cause, cause)
})

test("error helpers normalize unknown values", () => {
  const error = new Error("boom")

  assert.equal(toErrorMessage(error), "boom")
  assert.equal(toErrorMessage("plain"), "plain")
  assert.equal(toErrorMessage({}), "Unknown error")
  assert.equal(typeof toErrorStack(error), "string")
  assert.equal(toErrorStack("plain"), undefined)
})
