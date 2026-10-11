import assert from "node:assert/strict"
import { test } from "node:test"
import {
  LiveNotificationsDisplayCache,
  LIVE_DISPLAY_TTL_MS,
  liveDisplayKey,
} from "./liveNotificationsDisplayCache"
import type { LiveNotificationsView } from "../sections/useLiveNotifications"
const now = Date.now()
const ready: LiveNotificationsView = {
  ownerKey: "owner",
  verifiedAt: now,
  config: {
    liveNotificationsEnabled: true,
    liveNotificationMentionMode: "none",
  },
  source: {
    status: "ready",
    broadcasterId: "123",
    login: "owner",
    displayName: "Owner",
    avatarUrl: "https://example.com/avatar",
  },
  discordStatus: "ready",
  subscriptionStatus: "ready",
  isOwner: true,
  botLeft: false,
}
const key = liveDisplayKey("user", "session", "guild", "owner")
function fixture() {
  let value: string | null = null
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
  return {
    storage,
    cache: new LiveNotificationsDisplayCache(() => storage),
    stored: () => value,
  }
}
test("session display cache survives navigation and refresh, expires, and stores no authority or config", () => {
  const { cache, storage, stored } = fixture()
  assert.equal(cache.read(key, now), undefined)
  cache.write(key, ready, now)
  const display = cache.read(key, now)
  assert.deepEqual(display, {
    source: ready.source,
    discordStatus: "ready",
    verifiedAt: now,
  })
  assert.deepEqual(
    new LiveNotificationsDisplayCache(() => storage).read(key, now),
    display
  )
  assert.doesNotMatch(
    stored()!,
    /config|isOwner|liveNotificationsEnabled|token/i
  )
  assert.equal(
    cache.read(liveDisplayKey("other", "session", "guild", "owner"), now),
    undefined
  )
  assert.equal(
    cache.read(liveDisplayKey("user", "other", "guild", "owner"), now),
    undefined
  )
  assert.equal(
    cache.read(liveDisplayKey("user", "session", "other", "owner"), now),
    undefined
  )
  assert.equal(
    cache.read(liveDisplayKey("user", "session", "guild", "other"), now),
    undefined
  )
  cache.write(
    key,
    { ...ready, verifiedAt: now - 1, source: { status: "stale" } },
    now
  )
  assert.deepEqual(cache.read(key, now), display)
  cache.write(key, { ...ready, verifiedAt: now + 1 }, now)
  cache.write(key, { ...ready, verifiedAt: now - LIVE_DISPLAY_TTL_MS }, now)
  assert.deepEqual(cache.read(key, now), display)
  assert.equal(cache.read(key, now + LIVE_DISPLAY_TTL_MS), undefined)
  cache.write(key, ready, now)
  assert.equal(cache.read(key, now - 1), undefined)
})
test("confirmed loss replaces Ready while temporary provider failures never populate session cache", () => {
  const { cache } = fixture()
  for (const status of ["stale", "needsLink", "missingPermission"] as const) {
    cache.write(
      key,
      { ...ready, verifiedAt: now + 1, source: { status } },
      now + 1
    )
    assert.equal(cache.read(key, now + 1)?.source.status, status)
    cache.remove(key)
  }
  for (const status of ["unavailable", "configurationUnavailable"] as const) {
    cache.write(key, { ...ready, source: { status } }, now)
    assert.equal(cache.read(key, now), undefined)
  }
  cache.write(
    key,
    {
      ...ready,
      source: {
        status: "ready",
        broadcasterId: "123",
        login: "owner",
        displayName: "Owner",
      },
    },
    now
  )
  cache.write("other", ready, now)
  cache.invalidate("user", "session", "guild")
  assert.equal(cache.read(key, now), undefined)
  assert.ok(cache.read("other", now))
})
test("malformed, stale or future persisted display data is discarded and extra fields are stripped", () => {
  const valid = {
    source: ready.source,
    discordStatus: "ready",
    verifiedAt: now,
  }
  const invalid = [
    null,
    1,
    {},
    { ...valid, verifiedAt: "1" },
    { ...valid, verifiedAt: 1.5 },
    { ...valid, discordStatus: "bad" },
    { ...valid, discordStatus: null },
    { ...valid, source: null },
    { ...valid, source: 1 },
    { ...valid, source: {} },
    ...["broadcasterId", "login", "displayName"].flatMap((field) => {
      const source = { ...ready.source }
      Reflect.deleteProperty(source, field)
      return [
        { ...valid, source },
        { ...valid, source: { ...ready.source, [field]: 1 } },
      ]
    }),
    { ...valid, source: { ...ready.source, avatarUrl: 1 } },
    { ...valid, source: { status: "unavailable" } },
    { ...valid, source: { status: "unknown" } },
    { ...valid, verifiedAt: now + 1 },
    { ...valid, verifiedAt: now - LIVE_DISPLAY_TTL_MS },
  ]
  for (const value of invalid) {
    const cache = new LiveNotificationsDisplayCache(() => ({
      getItem: () => JSON.stringify([[key, value]]),
      setItem: () => {},
    }))
    assert.equal(cache.read(key, now), undefined, JSON.stringify(value))
  }
  for (const encoded of [
    "bad JSON",
    "null",
    "{}",
    JSON.stringify([null, [1, valid]]),
  ]) {
    const cache = new LiveNotificationsDisplayCache(() => ({
      getItem: () => encoded,
      setItem: () => {},
    }))
    assert.equal(cache.read(key, now), undefined)
  }
  for (const discordStatus of [
    "unavailable",
    "needsChannel",
    "needsRole",
  ] as const) {
    const { cache } = fixture()
    cache.write(key, { ...ready, discordStatus }, now)
    assert.equal(cache.read(key, now)?.discordStatus, discordStatus)
  }
})
test("session cache bounds entries and remains usable when browser storage is blocked", () => {
  const { cache, storage } = fixture()
  for (let i = 0; i < 20; i++) cache.write(String(i), ready, now)
  assert.equal(cache.read("0", now), undefined)
  assert.ok(cache.read("19", now))
  assert.ok(new LiveNotificationsDisplayCache(() => storage).read("19", now))
  for (const storage of [
    undefined,
    {
      getItem: () => {
        throw Error("blocked")
      },
      setItem: () => {
        throw Error("blocked")
      },
    },
  ]) {
    const cache = new LiveNotificationsDisplayCache(() => storage)
    cache.write(key, ready, now)
    assert.ok(cache.read(key, now))
    cache.remove(key)
    assert.equal(cache.read(key, now), undefined)
  }
})
