import assert from "node:assert/strict"
import { test } from "node:test"

import { cn } from "./utils.js"

test("cn merges conditional class values", () => {
  assert.equal(cn("flex", false, ["items-center"]), "flex items-center")
})

test("cn resolves conflicting Tailwind classes with the latest value", () => {
  assert.equal(cn("px-2 py-1", "px-4"), "py-1 px-4")
})
