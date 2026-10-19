import assert from "node:assert/strict"
import { test } from "node:test"
import type { TimerRuntimeGroup } from "@workspace/shared/twitchTimers"
import { TimerScheduler } from "./TimerScheduler"
import { ChatActivity } from "./ChatActivity"
import { ChatBackpressure } from "../ChatSendQueue"
import { silentLogger } from "../../../tests/fixtures"
import type { ConvexService } from "../ConvexService"
import { TwitchApiService, TwitchFailure } from "../TwitchApiService"
import { apiConfig } from "../../../tests/fixtures"

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
      streamId: "100",
      sessionStartedAt: 900000,
      sessionLive: true,
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
  const convex: Pick<
    ConvexService,
    | "timerPage"
    | "claimTimer"
    | "settleTimer"
    | "diagnoseTimer"
    | "beginTimer"
    | "timerSession"
  > = {
    beginTimer: async () => true,
    timerSession: async () => true,
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
  const provider: Pick<
    TwitchApiService,
    "liveBroadcasters" | "sendChatMessage"
  > = {
    liveBroadcasters: async () => {
      if (providerFailure) throw new Error("down")
      return new Map(live ? [["222", { id: "100", startedAt: 900000 }]] : [])
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
    now: () => now,
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

test("offline channels accumulate no activity, claims or repeated eligibility/live checks", async (t) => {
  const s = setup()
  s.live(false)
  const checks = t.mock.method(s.provider, "liveBroadcasters")
  const claims = t.mock.method(s.convex, "claimTimer")
  await s.scheduler.tick()
  for (let i = 0; i < 19; i++) {
    s.advance(15000)
    s.chat()
    await s.scheduler.tick()
  }
  assert.equal(checks.mock.callCount(), 1)
  assert.equal(claims.mock.callCount(), 0)
  assert.equal(s.activity.snapshot("222").count, 0)
  assert.deepEqual(s.states, [])
  s.live(true)
  await s.scheduler.lifecycle("222", true, s.now())
  s.chat()
  await s.scheduler.tick()
  assert.equal(s.sent.length, 0)
  s.advance(300000)
  s.chat()
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first"])
  await s.scheduler.stop()
})

for (const lostAcknowledgement of [false, true]) {
  test(`confirmed delivery retries only success settlement, committed acknowledgement lost=${lostAcknowledgement}`, async (t) => {
    const s = setup()
    const records: boolean[] = []
    let fail = true
    t.mock.method(
      s.convex,
      "settleTimer",
      async (_id: string, _execution: string, sent: boolean) => {
        records.push(sent)
        if (fail) {
          if (lostAcknowledgement) s.settled.push(sent)
          throw new Error("lost settlement")
        }
      }
    )
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    await s.scheduler.tick()
    assert.deepEqual(s.sent, ["first"])
    assert.deepEqual(records, [true])
    s.advance(15000)
    await s.scheduler.tick()
    assert.deepEqual(records, [true, true])
    fail = false
    s.advance(15000)
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    await s.scheduler.tick()
    assert.deepEqual(s.sent, ["first", "second"])
    assert.ok(records.every(Boolean))
    await s.scheduler.stop()
  })
}

test("a denied group backs off while a healthy broadcaster continues", async (t) => {
  const s = setup(),
    claims: string[] = []
  s.changes([group, { ...group, id: "healthy", broadcasterId: "333" }])
  t.mock.method(
    s.provider,
    "liveBroadcasters",
    async () =>
      new Map([
        ["222", { id: "100", startedAt: 900000 }],
        ["333", { id: "100", startedAt: 900000 }],
      ])
  )
  t.mock.method(s.convex, "claimTimer", async (id: string) => {
    claims.push(id)
    return id === "group"
      ? null
      : {
          executionId: "healthy-execution",
          message: "first",
          expiresAt: s.now() + 60000,
        }
  })
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  s.activity.observe("333", "viewer", "one", s.now())
  s.activity.observe("333", "viewer", "two", s.now())
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first"])
  for (let i = 0; i < 10; i++) {
    s.advance(15000)
    s.chat()
    await s.scheduler.tick()
  }
  assert.equal(claims.filter((id) => id === "group").length, 1)
  await s.scheduler.stop()
})

for (const stage of ["claim", "live"] as const) {
  test(`slow timer ${stage} preparation does not hold the shared queue against an alert`, async (t) => {
    const s = setup()
    await s.scheduler.tick()
    let release: () => void = () => {},
      entered: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const waiting = new Promise<void>((resolve) => {
      entered = resolve
    })
    const posts: string[] = []
    const api = new TwitchApiService(apiConfig, async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)).broadcaster_id)
      return Response.json({ data: [{ message_id: "id", is_sent: true }] })
    })
    t.mock.method(s.provider, "sendChatMessage", api.sendChatMessage.bind(api))
    const claim = s.convex.claimTimer,
      live = s.provider.liveBroadcasters
    if (stage === "claim")
      t.mock.method(
        s.convex,
        "claimTimer",
        async (...args: Parameters<ConvexService["claimTimer"]>) => {
          entered()
          await held
          return claim(...args)
        }
      )
    else
      t.mock.method(
        s.provider,
        "liveBroadcasters",
        async (...args: Parameters<TwitchApiService["liveBroadcasters"]>) => {
          if (args[1].length === 1 && ++checks === 2) {
            entered()
            await held
          }
          return live(...args)
        }
      )
    let checks = 0
    s.advance(300000)
    s.chat()
    const tick = s.scheduler.tick()
    await waiting
    assert.equal(await api.sendChatMessage("app", "444", "Live alert"), "id")
    assert.deepEqual(posts, ["444"])
    release()
    await tick
    assert.deepEqual(posts, ["444", "222"])
    await s.scheduler.stop()
  })
}

for (const transition of ["offline", "newStream"] as const) {
  test(`a ${transition} event cancels old queued work before POST`, async (t) => {
    const s = setup()
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    const send = s.provider.sendChatMessage
    t.mock.method(
      s.provider,
      "sendChatMessage",
      async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
        if (transition === "newStream")
          t.mock.method(
            s.provider,
            "liveBroadcasters",
            async () => new Map([["222", { id: "101", startedAt: s.now() }]])
          )
        await s.scheduler.lifecycle("222", transition !== "offline", s.now())
        return send(...args)
      }
    )
    await s.scheduler.tick()
    assert.deepEqual(s.sent, [])
    assert.deepEqual(s.settled, [false])
    assert.equal(s.activity.snapshot("222").count, 0)
    await s.scheduler.stop()
  })
}

test("same-stream restart preserves rotation, a new stream resets enabled groups independently", async (t) => {
  const s = setup()
  s.changes([{ ...group, cursor: 1 }])
  t.mock.method(s.convex, "claimTimer", async () => ({
    executionId: "same-stream",
    message: "second",
    expiresAt: s.now() + 60000,
  }))
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["second"])
  await s.scheduler.stop()
  const fresh = setup()
  fresh.changes([
    { ...group, cursor: 1 },
    { ...group, id: "other", cursor: 1 },
  ])
  t.mock.method(
    fresh.provider,
    "liveBroadcasters",
    async () => new Map([["222", { id: "101", startedAt: fresh.now() }]])
  )
  t.mock.method(fresh.convex, "claimTimer", async (id: string) => ({
    executionId: id,
    message: "first",
    expiresAt: fresh.now() + 60000,
  }))
  await fresh.scheduler.tick()
  fresh.advance(300000)
  fresh.chat()
  await fresh.scheduler.tick()
  assert.deepEqual(fresh.sent, ["first", "first"])
  const calls = t.mock.method(fresh.provider, "liveBroadcasters")
  await fresh.scheduler.lifecycle("222", false, fresh.now() - 400000)
  assert.equal(calls.mock.callCount(), 0)
  await fresh.scheduler.lifecycle("222", true, fresh.now() + 1)
  assert.equal(calls.mock.callCount(), 0)
  await fresh.scheduler.lifecycle("missing", true, fresh.now())
  await fresh.scheduler.stop()
  await fresh.scheduler.lifecycle("222", true, fresh.now())
})

test("definite provider rejection releases a claim while ambiguous POSTs remain quarantined", async (t) => {
  for (const status of [400, 401, 403, 422, 429, 500]) {
    const s = setup(),
      results: boolean[] = []
    t.mock.method(
      s.convex,
      "settleTimer",
      async (
        _id: string,
        _execution: string,
        _sent: boolean,
        definite?: boolean
      ) => {
        results.push(!!definite)
      }
    )
    t.mock.method(
      s.provider,
      "sendChatMessage",
      async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
        await args[3]!()
        throw new TwitchFailure("apiUnavailable", status)
      }
    )
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    await s.scheduler.tick()
    assert.deepEqual(results, [status !== 500])
    await s.scheduler.stop()
  }
})

test("late reconciliation cannot overwrite a newer lifecycle event or shutdown", async (t) => {
  const s = setup()
  let entered: () => void = () => {},
    release: () => void = () => {},
    checks = 0
  const waiting = new Promise<void>((resolve) => {
    entered = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  t.mock.method(s.provider, "liveBroadcasters", async () => {
    if (++checks === 1) {
      entered()
      await held
      return new Map()
    }
    return new Map([["222", { id: "100", startedAt: 900000 }]])
  })
  const tick = s.scheduler.tick()
  await waiting
  s.advance(1)
  await s.scheduler.lifecycle("222", true, s.now())
  await s.scheduler.lifecycle("222", true, s.now()) // Redelivery.
  release()
  await tick
  s.chat()
  assert.equal(s.activity.snapshot("222").count, 2)
  s.changes([{ ...group, enabled: false }])
  s.advance(15000)
  await s.scheduler.tick()
  assert.equal(s.activity.snapshot("222").count, 0)
  await s.scheduler.stop()
  for (const stage of ["live", "persist"] as const) {
    const stopped = setup()
    if (stage === "live")
      t.mock.method(stopped.provider, "liveBroadcasters", async () => {
        stopped.scheduler.stopAccepting()
        return new Map()
      })
    else
      t.mock.method(stopped.convex, "timerSession", async () => {
        stopped.scheduler.stopAccepting()
        return true
      })
    await stopped.scheduler.tick()
    assert.equal(stopped.activity.snapshot("222").count, 0)
    await stopped.scheduler.stop()
  }
})

test("unavailable session authority and transient preparation failures recover with bounded backoff", async (t) => {
  const declined = setup()
  t.mock.method(declined.convex, "timerSession", async () => false)
  await declined.scheduler.tick()
  declined.chat()
  assert.equal(declined.activity.snapshot("222").count, 0)
  await declined.scheduler.stop()
  const unavailable = setup()
  unavailable.providerFailure(true)
  await unavailable.scheduler.tick()
  assert.equal(unavailable.activity.snapshot("222").count, 0)
  await unavailable.scheduler.stop()
  for (const error of [new Error("outage"), new ChatBackpressure()]) {
    const s = setup()
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    t.mock.method(s.convex, "claimTimer", async () => {
      throw error
    })
    await s.scheduler.tick()
    assert.ok(
      s.states.includes(
        error instanceof ChatBackpressure
          ? "rateLimited"
          : "providerUnavailable"
      )
    )
    s.advance(15000)
    await s.scheduler.tick()
    assert.equal(s.sent.length, 0)
    await s.scheduler.stop()
  }
  const failedLifecycle = setup()
  await failedLifecycle.scheduler.tick()
  failedLifecycle.providerFailure(true)
  await failedLifecycle.scheduler.lifecycle("222", true, failedLifecycle.now())
  failedLifecycle.chat()
  assert.equal(failedLifecycle.activity.snapshot("222").count, 0)
  await failedLifecycle.scheduler.stop()
})

test("a backend session change fences cached work and a rejected begin never reaches POST", async (t) => {
  const s = setup()
  await s.scheduler.tick()
  s.changes([
    { ...group, streamId: "101", sessionStartedAt: s.now(), sessionLive: true },
  ])
  t.mock.method(
    s.provider,
    "liveBroadcasters",
    async () => new Map([["222", { id: "101", startedAt: s.now() }]])
  )
  s.advance(15000)
  await s.scheduler.tick()
  t.mock.method(s.convex, "beginTimer", async () => false)
  s.advance(300000)
  s.chat()
  await s.scheduler.tick()
  assert.deepEqual(s.sent, [])
  assert.deepEqual(s.settled, [false])
  s.changes([{ ...group, sessionLive: false }])
  s.advance(15000)
  await s.scheduler.tick()
  s.chat()
  assert.equal(s.activity.snapshot("222").count, 0)
  await s.scheduler.stop()
})
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
  await s.scheduler.lifecycle("222", true, s.now())
  s.advance(300000)
  s.chat()
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first"])
  s.advance(300000)
  s.chat()
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first", "second"])
  assert.deepEqual(s.settled, [false, true, true]) // Offline pre-send claim is released definitively.
  await s.scheduler.stop()
  await s.scheduler.tick()
  assert.equal(s.activity.snapshot("222").count, 0)
})

const group: TimerRuntimeGroup = {
  id: "group",
  broadcasterId: "222",
  name: "Links",
  enabled: true,
  messages: ["first", "second"],
  intervalMinutes: 5,
  minimumMessages: 2,
  revision: 1,
  cursor: 0,
  streamId: "100",
  sessionStartedAt: 900000,
  sessionLive: true,
}
test("incremental changes restore durable cursors, reject stale evidence and remove disabled groups", async () => {
  const s = setup()
  await s.scheduler.tick()
  s.advance(15000)
  s.changes([{ ...group }])
  await s.scheduler.tick()
  s.advance(15000)
  s.changes([
    { ...group, cursor: 1, lastSentAt: 2000000, lastAttemptAt: 2000000 },
  ])
  await s.scheduler.tick()
  s.advance(15000)
  s.changes([{ ...group, lastSentAt: 1, lastAttemptAt: 1 }])
  await s.scheduler.tick()
  s.advance(15000)
  s.changes([{ ...group, revision: 2 }])
  await s.scheduler.tick()
  s.advance(15000)
  s.changes([{ ...group, enabled: false }])
  await s.scheduler.tick()
  s.advance(15000)
  s.changes([{ ...group, messages: [] }])
  await s.scheduler.tick()
  assert.equal(s.activity.snapshot("222").count, 0)
  await s.scheduler.stop()
})
test("initial pages, memory capacity and interrupted refreshes are bounded", async (t) => {
  const s = setup()
  let pages = 0
  t.mock.method(s.convex, "timerPage", async () => ({
    groups: [group],
    cursor: ++pages === 1 ? "next" : null,
    startedAt: 1000000,
  }))
  await s.scheduler.tick()
  assert.equal(pages, 2)
  const abort = setup()
  t.mock.method(abort.convex, "timerPage", async () => {
    abort.abort.abort()
    return { groups: [], cursor: "next", startedAt: 1000000 }
  })
  await abort.scheduler.tick()
  await abort.scheduler.stop()
  const oversized = setup()
  oversized.changes(Array(10001).fill(group))
  await oversized.scheduler.tick()
  assert.equal(oversized.sent.length, 0)
  const full = setup()
  full.changes(
    Array.from({ length: 10000 }, (_, i) => ({ ...group, id: String(i) }))
  )
  await full.scheduler.tick()
  full.advance(15000)
  full.changes([group])
  await full.scheduler.tick()
  assert.equal(full.sent.length, 0)
  await full.scheduler.stop()
  await oversized.scheduler.stop()
  await s.scheduler.stop()
})
test("queued work rechecks fresh activity, shutdown, configuration and live status before claiming", async (t) => {
  for (const mode of ["abort", "stale", "quiet", "offline", "error"]) {
    const s = setup()
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    if (mode === "offline") {
      let checks = 0
      t.mock.method(
        s.provider,
        "liveBroadcasters",
        async () =>
          new Map(
            ++checks === 1 ? [["222", { id: "100", startedAt: 900000 }]] : []
          )
      )
    }
    const send = s.provider.sendChatMessage
    t.mock.method(
      s.provider,
      "sendChatMessage",
      async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
        if (mode === "abort") s.abort.abort()
        if (mode === "stale") s.advance(61000)
        if (mode === "quiet") s.advance(300000)
        if (mode === "error") throw new Error("provider unavailable")
        return send(...args)
      }
    )
    await s.scheduler.tick()
    assert.equal(s.sent.length, 0)
    await s.scheduler.stop()
  }
})
test("failed or suppressed claimed POSTs settle uncertain and never replay immediately", async (t) => {
  for (const mode of ["expired", "mismatch", "postFailure"]) {
    const s = setup()
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    t.mock.method(s.convex, "claimTimer", async () => ({
      executionId: "claim",
      message: mode === "mismatch" ? "wrong" : "first",
      expiresAt: mode === "expired" ? 0 : 2000000,
    }))
    if (mode === "postFailure")
      t.mock.method(
        s.provider,
        "sendChatMessage",
        async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
          await args[3]!()
          throw new Error("ambiguous POST")
        }
      )
    await s.scheduler.tick()
    assert.deepEqual(s.settled, [false])
    s.advance(15000)
    await s.scheduler.tick()
    assert.equal(s.settled.length, 1)
    await s.scheduler.stop()
  }
  const s = setup()
  await s.scheduler.tick()
  s.advance(300000)
  t.mock.method(s.convex, "diagnoseTimer", async () => {
    throw new Error("unavailable")
  })
  await s.scheduler.tick()
  await s.scheduler.stop()
  const repeat = setup()
  await repeat.scheduler.tick()
  repeat.advance(300000)
  await repeat.scheduler.tick()
  repeat.advance(15000)
  await repeat.scheduler.tick()
  assert.equal(
    repeat.states.filter((s) => s === "waitingForActivity").length,
    1
  )
  await repeat.scheduler.stop()
})
test("unexpected scheduler errors are contained, including default clock startup", async (t) => {
  const s = setup()
  t.mock.method(s.scheduler, "tick", async () => {
    throw new Error("unexpected")
  })
  s.scheduler.start()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await s.scheduler.stop()
  const natural = new TimerScheduler(
    s.convex,
    s.provider,
    { appToken: async () => "app" },
    new ChatActivity("bot"),
    silentLogger,
    new AbortController().signal
  )
  await natural.tick()
  await natural.stop()
})

test("the full next interval starts after a slow confirmed send completes", async (t) => {
  const s = setup()
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  const send = s.provider.sendChatMessage
  t.mock.method(
    s.provider,
    "sendChatMessage",
    async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
      const result = await send(...args)
      s.advance(30000)
      return result
    }
  )
  await s.scheduler.tick()
  assert.equal(s.sent.length, 1)
  s.advance(299999)
  s.chat()
  await s.scheduler.tick()
  assert.equal(s.sent.length, 1)
  s.advance(1)
  await s.scheduler.tick()
  assert.equal(s.sent.length, 2)
  await s.scheduler.stop()
})

test("groups sharing a broadcaster reset only their own successful-send activity baseline", async (t) => {
  const s = setup()
  s.changes([group, { ...group, id: "second", minimumMessages: 3 }])
  t.mock.method(s.convex, "claimTimer", async () => ({
    executionId: "claim",
    message: "first",
    expiresAt: 2000000,
  }))
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first"])
  s.advance(15000)
  s.activity.observe("222", "viewer", "third-viewer-event", 1315000)
  await s.scheduler.tick()
  assert.deepEqual(s.sent, ["first", "first"])
  await s.scheduler.stop()
})
test("stale configuration fails closed without replaying missed intervals", async () => {
  const s = setup()
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  s.unavailable(true)
  await s.scheduler.tick()
  assert.equal(s.sent.length, 0)
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
