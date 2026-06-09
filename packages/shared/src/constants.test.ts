import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ADMIN_ROLES,
  APP_SOURCES,
  ENTITLEMENT_STATUSES,
  LOG_LEVELS,
  PLANS,
  STAFF_ROLES,
  USER_ROLES,
  USER_STATUSES,
} from "./constants"

function assertUnique(values: readonly string[]): void {
  assert.equal(new Set(values).size, values.length)
}

test("role constants keep staff and admin roles within user roles", () => {
  assert.equal(USER_ROLES[0], "user")
  assert.equal(USER_ROLES.at(-1), "superadmin")

  for (const role of STAFF_ROLES) {
    assert.ok(USER_ROLES.includes(role))
  }

  for (const role of ADMIN_ROLES) {
    assert.ok(STAFF_ROLES.includes(role))
  }
})

test("shared string constants have no duplicate values", () => {
  for (const values of [
    USER_ROLES,
    STAFF_ROLES,
    ADMIN_ROLES,
    USER_STATUSES,
    APP_SOURCES,
    PLANS,
    ENTITLEMENT_STATUSES,
    LOG_LEVELS,
  ]) {
    assertUnique(values)
  }
})

test("shared product constants include required runtime categories", () => {
  assert.ok(USER_STATUSES.includes("active"))
  assert.ok(USER_STATUSES.includes("disabled"))
  assert.ok(APP_SOURCES.includes("dashboard"))
  assert.ok(APP_SOURCES.includes("discord-bot"))
  assert.ok(PLANS.includes("free"))
  assert.ok(PLANS.includes("enterprise"))
  assert.ok(LOG_LEVELS.includes("error"))
})
