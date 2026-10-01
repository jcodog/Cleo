import assert from "node:assert/strict"
import { test } from "node:test"
test("live settings use one reactive Convex query and update without refresh", async (t) => {
  let value: unknown
  const args: unknown[] = []
  t.mock.module("convex/react", {
    exports: {
      useQuery: (_query: unknown, arg: unknown) => {
        args.push(arg)
        return value
      },
    },
  })
  const { useLiveNotifications } = await import("./useLiveNotifications")
  assert.equal(useLiveNotifications("one").view, undefined)
  value = {
    config: { liveNotificationsEnabled: false },
    subscriptionStatus: "disabled",
  }
  assert.equal(useLiveNotifications("one").view, value)
  value = {
    config: { liveNotificationsEnabled: true },
    subscriptionStatus: "connecting",
  }
  assert.equal(useLiveNotifications("one").view, value)
  value = {
    config: { liveNotificationsEnabled: true },
    subscriptionStatus: "ready",
  }
  assert.equal(useLiveNotifications("two").view, value)
  assert.deepEqual(args.at(-1), { discordGuildId: "two" })
})
