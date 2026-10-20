import assert from "node:assert/strict"
import { test } from "node:test"
import { ChatActivity } from "./ChatActivity"

test("activity isolates broadcasters, excludes bot and duplicates, expires quiet activity and bounds memory", () => {
  const activity = new ChatActivity("999")
  activity.watch(["222", "333"])
  activity.observe("unknown", "user", "id", 1000)
  activity.observe("222", "999", "bot", 1000)
  assert.equal(activity.snapshot("222").count, 0)
  activity.observe("222", "user", "first", 1000)
  activity.observe("222", "user", "first", 1001)
  assert.equal(activity.snapshot("222").count, 1)
  assert.equal(activity.snapshot("333").count, 0)
  assert.equal(activity.eligible("222", 0, 1, 1001), true)
  assert.equal(activity.eligible("222", 1, 1, 1001), false)
  assert.equal(activity.eligible("222", 0, 1, 301000), false)
  assert.equal(activity.eligible("222", 0, 1, 999), false)
  for (let i = 0; i < 20010; i++)
    activity.observe("222", "user", String(i), 2000)
  const counted = activity.snapshot("222").count
  assert.ok(counted > 512)
  activity.observe("333", "user", "first", 2000)
  activity.observe("333", "user", "first", 2001)
  assert.equal(activity.snapshot("333").count, 1)
  activity.observe("222", "user", "new-window", 700000)
  assert.equal(activity.snapshot("222").count, counted + 1)
  activity.watch(["333"])
  assert.equal(activity.snapshot("222").count, 0)
  activity.watch(Array.from({ length: 10001 }, (_, i) => String(i)))
  activity.observe("10000", "user", "ignored", 1)
  assert.equal(activity.snapshot("10000").count, 0)
  activity.clear()
  assert.deepEqual(activity.snapshot("333"), { count: 0, lastAt: 0 })
})

test("validated event times cannot renew delayed, future or pre-session activity", () => {
  const activity = new ChatActivity("bot")
  activity.watch(["a"])
  activity.reset("a", 1000)
  activity.observe("a", "viewer", "old-session", 999, 1000)
  activity.observe("a", "viewer", "future", 61001, 1000)
  activity.observe("a", "viewer", "stale", 1000, 301000)
  assert.equal(activity.snapshot("a").count, 0)
  activity.observe("a", "viewer", "new", 2000, 3000)
  activity.observe("a", "viewer", "out-of-order", 1500, 3000)
  assert.equal(activity.snapshot("a").lastAt, 2000)
  assert.equal(activity.eligible("a", 0, 2, 302000), false)
  activity.watch([])
  activity.observe("a", "viewer", "offline", 4000)
  assert.equal(activity.snapshot("a").count, 0)
  activity.reset("absent", 1)
})

test("sustained sampled activity supports repeated baselines, replay suppression and unordered expiry", () => {
  const activity = new ChatActivity("bot")
  activity.watch(["a", "b"])
  let baseline = 0
  for (let minute = 0; minute < 18; minute++) {
    const now = 1_000_000 + minute * 60_000
    const before = activity.snapshot("a").count
    for (let i = 0; i < 6000; i++) {
      const id = `${minute}:${i}`
      activity.observe("a", "viewer", id, now)
    }
    const accepted = activity.snapshot("a").count
    assert.ok(accepted > before, "busy chat never freezes at the hash budget")
    for (let i = 5999; i >= 0; i--)
      activity.observe("a", "viewer", `${minute}:${i}`, now, now + 1)
    assert.equal(activity.snapshot("a").count, accepted)
    if (minute % 5 === 4) {
      assert.equal(activity.eligible("a", baseline, 100, now), true)
      baseline = accepted
      assert.equal(activity.eligible("a", baseline, 5, now), false)
    }
    activity.observe("b", "viewer", String(minute), now)
    assert.equal(activity.eligible("b", 0, 1, now), true)
    // An earlier handler finishes after the newest insertion.
    activity.observe("a", "viewer", `late:${minute}`, now - 1000, now - 500)
    const channels: Map<
      string,
      { buckets: Map<number, { ids: Set<bigint> }> }
    > = Reflect.get(activity, "channels")
    const buckets = [...channels.get("a")!.buckets.values()]
    assert.ok(buckets.length <= 6)
    assert.ok(
      buckets.reduce((total, bucket) => total + bucket.ids.size, 0) <= 768
    )
  }
  const last = activity.snapshot("a").lastAt
  assert.equal(activity.eligible("a", 0, 1, last + 300000), false)
  activity.observe("a", "viewer", "genuinely-new", last + 700000)
  assert.equal(activity.snapshot("a").lastAt, last + 700000)
  activity.watch([])
  assert.equal(activity.snapshot("a").count, 0)
  activity.watch(["a"])
  activity.reset("a", last + 800000)
  activity.observe("a", "viewer", "old-session", last, last + 800000)
  assert.equal(activity.snapshot("a").count, 0)
})

test("signed-clock skew is bounded and clamped without extending freshness or crossing session baselines", () => {
  for (const skew of [20000, 60000]) {
    const activity = new ChatActivity("bot")
    activity.watch(["a"])
    activity.reset("a", 1000000)
    activity.observe("a", "viewer", "skew", 1000000 + skew, 1000000)
    assert.deepEqual(activity.snapshot("a"), { count: 1, lastAt: 1000000 })
    assert.equal(activity.eligible("a", 0, 1, 1000000), true)
    activity.observe("a", "viewer", "skew", 1000000 + skew, 1000001)
    activity.observe("a", "viewer", "too-future", 1060002, 1000001)
    activity.observe("a", "viewer", "too-old", 700000, 1000001)
    assert.equal(activity.snapshot("a").count, 1)
    activity.observe("a", "viewer", "late", 999999, 1000001)
    assert.equal(activity.snapshot("a").count, 1)
    assert.equal(activity.eligible("a", 0, 1, 1300000), false)
    activity.reset("a", 1400000)
    activity.observe("a", "viewer", "old-stream", 1399999, 1400000)
    activity.observe("a", "viewer", "fresh-stream", 1400000 + skew, 1400000)
    assert.deepEqual(activity.snapshot("a"), { count: 1, lastAt: 1400000 })
  }
})
