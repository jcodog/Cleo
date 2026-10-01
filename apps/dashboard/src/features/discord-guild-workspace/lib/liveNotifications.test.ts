import assert from "node:assert/strict"
import { test } from "node:test"
import { getLiveNotificationState } from "./liveNotifications"

test("live notification overview covers configuration, authority and runtime availability", () => {
  const view = {
    botLeft: false,
    config: {
      liveNotificationsEnabled: true,
      liveNotificationChannelId: "123456789012345678",
    },
    source: { status: "ready" },
    subscriptionStatus: "ready",
    discordStatus: "ready",
  }
  assert.equal(getLiveNotificationState(undefined), "Loading")
  assert.equal(getLiveNotificationState(undefined, true), "Unavailable")
  assert.equal(
    getLiveNotificationState({ ...view, botLeft: true }),
    "Unavailable"
  )
  assert.equal(
    getLiveNotificationState({ ...view, source: { status: "needsLink" } }),
    "Needs Twitch link"
  )
  assert.equal(
    getLiveNotificationState({ ...view, source: { status: "stale" } }),
    "Unavailable"
  )
  assert.equal(
    getLiveNotificationState({
      ...view,
      config: { liveNotificationsEnabled: false },
    }),
    "Disabled"
  )
  assert.equal(
    getLiveNotificationState({
      ...view,
      config: { liveNotificationsEnabled: true },
    }),
    "Needs channel"
  )
  assert.equal(getLiveNotificationState(view), "Ready")
  assert.equal(
    getLiveNotificationState({ ...view, discordStatus: "unavailable" }),
    "Unavailable"
  )
  assert.equal(
    getLiveNotificationState({ ...view, discordStatus: "needsChannel" }),
    "Needs channel"
  )
  assert.equal(
    getLiveNotificationState({ ...view, discordStatus: "needsRole" }),
    "Needs role"
  )
  assert.equal(
    getLiveNotificationState({ ...view, subscriptionStatus: "pending" }),
    "Connecting"
  )
  assert.equal(
    getLiveNotificationState({ ...view, subscriptionStatus: "unavailable" }),
    "Unavailable"
  )
})
