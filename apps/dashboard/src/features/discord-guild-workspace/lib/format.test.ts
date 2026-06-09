import assert from "node:assert/strict"
import { test } from "node:test"

import type { GuildOverview } from "../types"
import {
  formatDateTime,
  formatNumber,
  getBotStatusLabel,
  getErrorMessage,
  toTitleCase,
} from "./format"

test("format helpers return explicit unsynced labels", () => {
  assert.equal(formatNumber(undefined), "Not Synced")
  assert.equal(formatDateTime(undefined), "Not Synced")
})

test("toTitleCase normalizes common route and event separators", () => {
  assert.equal(toTitleCase("audit-log.sync_ready"), "Audit Log Sync Ready")
  assert.equal(toTitleCase("  moderation--actions  "), "Moderation Actions")
})

test("bot status labels prefer strongest installation state", () => {
  assert.equal(getBotStatusLabel(true, {} as GuildOverview), "Bot Left")
  assert.equal(
    getBotStatusLabel(false, { botJoinedAt: 1 } as GuildOverview),
    "Gateway Synced"
  )
  assert.equal(
    getBotStatusLabel(
      false,
      { botInstallationVerifiedAt: 1 } as GuildOverview
    ),
    "REST Verified"
  )
  assert.equal(
    getBotStatusLabel(false, {} as GuildOverview),
    "Install Verification Needed"
  )
})

test("getErrorMessage avoids leaking non-error values", () => {
  assert.equal(getErrorMessage(new Error("No access")), "No access")
  assert.equal(getErrorMessage({ message: "not trusted" }), "Try again or refresh this workspace.")
})
