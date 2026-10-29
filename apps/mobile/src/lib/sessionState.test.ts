import assert from "node:assert/strict"
import { test } from "node:test"
import { directoryNotice, mobileSessionState } from "./sessionState"
test("session restoration waits for Clerk and Convex before exposing the server list", () => {
  assert.equal(mobileSessionState(false, undefined, true, false), "restoring")
  assert.equal(mobileSessionState(true, false, false, false), "signedOut")
  assert.equal(mobileSessionState(true, true, true, false), "connecting")
  assert.equal(mobileSessionState(true, true, false, true), "ready")
  assert.equal(
    mobileSessionState(true, true, false, false),
    "backendUnavailable"
  )
  assert.equal(
    mobileSessionState(true, false, false, true),
    "signedOut",
    "A signed-out Clerk session immediately hides old Convex data"
  )
})
test("directory states describe pending, expired and provider failure separately", () => {
  assert.equal(directoryNotice("ready"), "")
  assert.match(directoryNotice("pending"), /Verifying/)
  assert.match(directoryNotice("expired"), /expired/)
  assert.match(directoryNotice("unavailable"), /unavailable/)
  assert.match(directoryNotice("missingDiscord"), /Connect Discord/)
})
