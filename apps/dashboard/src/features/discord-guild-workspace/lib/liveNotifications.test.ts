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
  assert.equal(
    getLiveNotificationState(undefined, true),
    "Provider unavailable"
  )
  assert.equal(
    getLiveNotificationState({ ...view, botLeft: true }),
    "Provider unavailable"
  )
  assert.equal(
    getLiveNotificationState({ ...view, source: { status: "needsLink" } }),
    "Connect Twitch"
  )
  assert.equal(
    getLiveNotificationState({ ...view, source: { status: "stale" } }),
    "Reconnect required"
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
    getLiveNotificationState({
      ...view,
      config: { liveNotificationsEnabled: false },
      subscriptionStatus: "failed",
    }),
    "Subscription failed"
  )
  assert.equal(
    getLiveNotificationState({
      ...view,
      config: { liveNotificationsEnabled: false },
      subscriptionStatus: "providerUnavailable",
    }),
    "Provider unavailable"
  )
  assert.equal(
    getLiveNotificationState({
      ...view,
      source: { status: "missingPermission" },
    }),
    "Missing permission"
  )
  assert.equal(
    getLiveNotificationState({ ...view, source: { status: "unavailable" } }),
    "Provider unavailable"
  )
  assert.equal(
    getLiveNotificationState({ ...view, subscriptionStatus: "failed" }),
    "Subscription failed"
  )
  assert.equal(
    getLiveNotificationState({ ...view, discordStatus: "unavailable" }),
    "Provider unavailable"
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
    getLiveNotificationState({ ...view, subscriptionStatus: "connecting" }),
    "Connecting"
  )
  assert.equal(
    getLiveNotificationState({
      ...view,
      subscriptionStatus: "providerUnavailable",
    }),
    "Provider unavailable"
  )
})
