import assert from "node:assert/strict"
import { test } from "node:test"

import { canShowStaffTools, getStaffTopbarEntry } from "./staffAccess"

test("top-bar staff entry is gated by ready staff tool access", () => {
  assert.equal(canShowStaffTools(undefined), false)
  assert.equal(canShowStaffTools({ status: "forbidden" }), false)
  assert.equal(canShowStaffTools({ status: "disabled" }), false)
  assert.equal(canShowStaffTools({ status: "ready" }), true)
})

test("top-bar staff entry points back to dashboard on staff routes", () => {
  assert.deepEqual(getStaffTopbarEntry("staff", { status: "ready" }), {
    href: "/dashboard",
    label: "Dashboard",
    mode: "dashboard",
  })

  assert.deepEqual(getStaffTopbarEntry("discord", { status: "ready" }), {
    href: "/staff",
    label: "Staff",
    mode: "staff",
  })

  assert.equal(getStaffTopbarEntry("staff", { status: "disabled" }), null)
})
