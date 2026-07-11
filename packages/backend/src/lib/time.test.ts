import assert from "node:assert/strict"
import { test } from "node:test"

import { addDays, now, toDateKey } from "./time"

test("toDateKey returns the UTC date segment", () => {
  assert.equal(toDateKey(new Date("2026-06-09T23:59:59.999Z")), "2026-06-09")
})

test("addDays adds whole UTC day intervals in milliseconds", () => {
  assert.equal(addDays(1_000, 2), 172_801_000)
  assert.equal(addDays(1_000, -1), -86_399_000)
})

test("now delegates to Date.now", (t) => {
  t.mock.method(Date, "now", () => 1_700_000_000_000)

  assert.equal(now(), 1_700_000_000_000)
})
