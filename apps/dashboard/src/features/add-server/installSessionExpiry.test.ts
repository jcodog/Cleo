import assert from "node:assert/strict"
import test from "node:test"

import {
  getNextInstallSessionExpiry,
  hasPendingInstall,
} from "./installSessionExpiry"

test("schedules invalidation at the earliest local or restored pending expiry", () => {
  assert.equal(
    getNextInstallSessionExpiry({
      activeInstallExpiresAt: 300,
      guilds: [
        { state: "pending", installSessionExpiresAt: 200 },
        { state: "installable" },
      ],
    }),
    200
  )
})

test("invalidates an already expired pending session immediately", () => {
  assert.equal(
    getNextInstallSessionExpiry({
      activeInstallExpiresAt: undefined,
      guilds: [{ state: "pending", installSessionExpiresAt: 90 }],
    }),
    90
  )
})

test("only a pending flow blocks another new install", () => {
  assert.equal(
    hasPendingInstall([{ state: "pending", installSessionExpiresAt: 101 }]),
    true
  )
  assert.equal(hasPendingInstall([{ state: "installable" }]), false)
})
