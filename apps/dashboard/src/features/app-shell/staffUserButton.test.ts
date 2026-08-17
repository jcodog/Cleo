import assert from "node:assert/strict"
import { test } from "node:test"

import { getStaffUserButtonLink } from "./staffUserButton"

test("staff UserButton link is absent when staff access is unavailable", () => {
  assert.equal(getStaffUserButtonLink(null), null)
})

test("staff UserButton link opens the staff dashboard from the Cleo dashboard", () => {
  assert.deepEqual(
    getStaffUserButtonLink({
      href: "/staff",
      mode: "staff",
    }),
    {
      href: "/staff",
      icon: "shield-lock",
      label: "Staff Dashboard",
    }
  )
})

test("staff UserButton link returns to the Cleo dashboard from staff mode", () => {
  assert.deepEqual(
    getStaffUserButtonLink({
      href: "/dashboard",
      mode: "dashboard",
    }),
    {
      href: "/dashboard",
      icon: "home",
      label: "Cleo Dashboard",
    }
  )
})
