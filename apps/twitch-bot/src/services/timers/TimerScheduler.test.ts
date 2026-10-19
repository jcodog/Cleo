import assert from "node:assert/strict"
import { test } from "node:test"
import type { TimerRuntimeGroup } from "@workspace/shared/twitchTimers"
import { TimerScheduler } from "./TimerScheduler"
import { ChatActivity } from "./ChatActivity"
import { ChatBackpressure } from "../ChatSendQueue"
import { silentLogger } from "../../../tests/fixtures"
import type { ConvexService } from "../ConvexService"
import type { TwitchApiService } from "../TwitchApiService"

function setup() {
  let now = 1_000_000
  let changes: TimerRuntimeGroup[] = [
    {
      id: "group",
      broadcasterId: "222",
      name: "Links",
      enabled: true,
      messages: ["first", "second"],
      intervalMinutes: 5,
      minimumMessages: 2,
      revision: 1,
      cursor: 0,
    },
  ]
  let unavailable = false,
    live = true,
    providerFailure = false,
    claimAllowed = true,
    settleFailure = false
  let backpressure = false
  const states: string[] = [],
    sent: string[] = [],
    settled: boolean[] = []
  const activity = new ChatActivity("999")
  const abort = new AbortController()
  const convex: Pick<ConvexService, "timerPage" | "claimTimer" | "settleTimer" | "diagnoseTimer"> = {
      timerPage: async () => {
        if (unavailable) throw new Error("down")
        const groups = changes
        changes = []
        return { groups, cursor: null, startedAt: now }
      },
      claimTimer: async () =>
        claimAllowed
          ? {
              executionId: "execution",
              message: sent.length % 2 ? "second" : "first",
              expiresAt: now + 60000,
            }
          : null,
      settleTimer: async (_id, _execution, success) => {
        if (settleFailure) throw new Error("down")
        settled.push(success)
      },
      diagnoseTimer: async (_id: string, _revision: number, state: string) => {
        states.push(state)
      },
    }
  const provider: Pick<TwitchApiService, "liveBroadcasters" | "sendChatMessage"> = {
      liveBroadcasters: async () => {
        if (providerFailure) throw new Error("down")
        return new Set(live ? ["222"] : [])
      },
      sendChatMessage: async (_token, _channel, message, beforeSend) => {
        if (backpressure) throw new ChatBackpressure()
        if (!(await beforeSend!())) return ""
        if (providerFailure) throw new Error("ambiguous POST")
        sent.push(message)
        return "sent"
      },
    }
  const scheduler = new TimerScheduler(
    convex,
    provider,
    { appToken: async () => "app" },
    activity,
    silentLogger,
    abort.signal,
    () => now
  )
  return {
    scheduler,
    convex,
    provider,
    activity,
    abort,
    states,
    sent,
    settled,
    advance(ms: number) {
      now += ms
    },
    chat() {
      activity.observe("222", "viewer", String(now), now)
      activity.observe("222", "viewer", `${now}-2`, now)
    },
    changes(groups: TimerRuntimeGroup[]) {
      changes = groups
    },
    unavailable(value: boolean) {
      unavailable = value
    },
    live(value: boolean) {
      live = value
    },
    providerFailure(value: boolean) {
      providerFailure = value
    },
    claimAllowed(value: boolean) {
      claimAllowed = value
    },
    settleFailure(value: boolean) {
      settleFailure = value
    },
    backpressure(value: boolean) {
      backpressure = value
    },
  }
}
test("timers wait for interval, fresh activity and a live stream then rotate confirmed sends", async () => {
  const s = setup()
  await s.scheduler.tick()
  s.chat()
  await s.scheduler.tick()
  assert.equal(s.sent.length, 0)
  s.advance(300000)
  await s.scheduler.tick()
  assert.ok(s.states.includes("waitingForActivity"))
  s.chat()
  s.advance(15000)
  s.live(false)
  await s.scheduler.tick()
  assert.ok(s.states.includes("waitingForStream"))
  s.live(true)
  s.advance(15000)
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first"])
  s.advance(300000)
  s.chat()
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first", "second"])
  assert.deepEqual(s.settled, [true, true])
  await s.scheduler.stop()
  await s.scheduler.tick()
  assert.equal(s.activity.snapshot("222").count, 0)
})

const group: TimerRuntimeGroup = { id: "group", broadcasterId: "222", name: "Links", enabled: true, messages: ["first", "second"], intervalMinutes: 5, minimumMessages: 2, revision: 1, cursor: 0 }
test("incremental changes restore durable cursors, reject stale evidence and remove disabled groups", async () => {
  const s = setup(); await s.scheduler.tick()
  s.advance(15000); s.changes([{ ...group }]); await s.scheduler.tick()
  s.advance(15000); s.changes([{ ...group, cursor: 1, lastSentAt: 2000000, lastAttemptAt: 2000000 }]); await s.scheduler.tick()
  s.advance(15000); s.changes([{ ...group, lastSentAt: 1, lastAttemptAt: 1 }]); await s.scheduler.tick()
  s.advance(15000); s.changes([{ ...group, revision: 2 }]); await s.scheduler.tick()
  s.advance(15000); s.changes([{ ...group, enabled: false }]); await s.scheduler.tick()
  s.advance(15000); s.changes([{ ...group, messages: [] }]); await s.scheduler.tick()
  assert.equal(s.activity.snapshot("222").count, 0)
  await s.scheduler.stop()
})
test("initial pages, memory capacity and interrupted refreshes are bounded", async (t) => {
  const s = setup(); let pages = 0
  t.mock.method(s.convex, "timerPage", async () => ({ groups: [group], cursor: ++pages === 1 ? "next" : null, startedAt: 1000000 }))
  await s.scheduler.tick(); assert.equal(pages, 2)
  const abort = setup(); t.mock.method(abort.convex, "timerPage", async () => { abort.abort.abort(); return { groups: [], cursor: "next", startedAt: 1000000 } })
  await abort.scheduler.tick(); await abort.scheduler.stop()
  const oversized = setup(); oversized.changes(Array(10001).fill(group)); await oversized.scheduler.tick()
  assert.equal(oversized.sent.length, 0)
  const full = setup(); full.changes(Array.from({ length: 10000 }, (_, i) => ({ ...group, id: String(i) }))); await full.scheduler.tick()
  full.advance(15000); full.changes([group]); await full.scheduler.tick()
  assert.equal(full.sent.length, 0)
  await full.scheduler.stop(); await oversized.scheduler.stop(); await s.scheduler.stop()
})
test("queued work rechecks fresh activity, shutdown, configuration and live status before claiming", async (t) => {
  for (const mode of ["abort", "stale", "quiet", "offline", "error"]) {
    const s = setup(); await s.scheduler.tick(); s.advance(300000); s.chat()
    if (mode === "offline") {
      let checks = 0
      t.mock.method(s.provider, "liveBroadcasters", async () => new Set(++checks === 1 ? ["222"] : []))
    }
    const send = s.provider.sendChatMessage
    t.mock.method(s.provider, "sendChatMessage", async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
      if (mode === "abort") s.abort.abort()
      if (mode === "stale") s.advance(61000)
      if (mode === "quiet") s.advance(300000)
      if (mode === "error") throw new Error("provider unavailable")
      return send(...args)
    })
    await s.scheduler.tick(); assert.equal(s.sent.length, 0); await s.scheduler.stop()
  }
})
test("failed or suppressed claimed POSTs settle uncertain and never replay immediately", async (t) => {
  for (const mode of ["expired", "mismatch", "postFailure"]) {
    const s = setup(); await s.scheduler.tick(); s.advance(300000); s.chat()
    t.mock.method(s.convex, "claimTimer", async () => ({ executionId: "claim", message: mode === "mismatch" ? "wrong" : "first", expiresAt: mode === "expired" ? 0 : 2000000 }))
    if (mode === "postFailure") t.mock.method(s.provider, "sendChatMessage", async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => { await args[3]!(); throw new Error("ambiguous POST") })
    await s.scheduler.tick(); assert.deepEqual(s.settled, [false]); s.advance(15000); await s.scheduler.tick(); assert.equal(s.settled.length, 1); await s.scheduler.stop()
  }
  const s = setup(); await s.scheduler.tick(); s.advance(300000)
  t.mock.method(s.convex, "diagnoseTimer", async () => { throw new Error("unavailable") })
  await s.scheduler.tick(); await s.scheduler.stop()
  const repeat = setup(); await repeat.scheduler.tick(); repeat.advance(300000); await repeat.scheduler.tick(); repeat.advance(15000); await repeat.scheduler.tick()
  assert.equal(repeat.states.filter(s => s === "waitingForActivity").length, 1)
  await repeat.scheduler.stop()
})
test("unexpected scheduler errors are contained, including default clock startup", async (t) => {
  const s = setup(); t.mock.method(s.scheduler, "tick", async () => { throw new Error("unexpected") })
  s.scheduler.start(); await new Promise(resolve => setTimeout(resolve, 20)); await s.scheduler.stop()
  const natural = new TimerScheduler(s.convex, s.provider, { appToken: async () => "app" }, new ChatActivity("bot"), silentLogger, new AbortController().signal)
  await natural.tick(); await natural.stop()
})
test("stale configuration, provider failures, revoked claims and backpressure fail closed", async () => {
  const s = setup()
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  s.unavailable(true)
  await s.scheduler.tick()
  assert.equal(s.sent.length, 0)
  s.unavailable(false)
  s.advance(15000)
  s.providerFailure(true)
  await s.scheduler.tick()
  assert.ok(s.states.includes("providerUnavailable"))
  s.providerFailure(false)
  s.claimAllowed(false)
  s.advance(15000)
  await s.scheduler.tick()
  assert.equal(s.sent.length, 0)
  s.claimAllowed(true)
  s.backpressure(true)
  s.advance(15000)
  await s.scheduler.tick()
  assert.ok(s.states.includes("rateLimited"))
  s.backpressure(false)
  s.settleFailure(true)
  s.advance(15000)
  await s.scheduler.tick()
  assert.equal(s.sent.length, 1)
  s.advance(15000)
  await s.scheduler.tick()
  assert.equal(s.sent.length, 1)
  s.abort.abort()
  await s.scheduler.tick()
  await s.scheduler.stop()
})
test("deadline loop cancels cleanly and does not replay missed sends after restart", async () => {
  const s = setup()
  s.scheduler.start()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await s.scheduler.stop()
  const restart = setup()
  await restart.scheduler.tick()
  restart.advance(86400000)
  await restart.scheduler.tick()
  assert.equal(restart.sent.length, 0)
  await restart.scheduler.stop()
})
