import assert from "node:assert/strict"
import { test } from "node:test"
import type { TimerRuntimeGroup } from "@workspace/shared/twitchTimers"
import { TimerScheduler } from "./TimerScheduler"
import { ChatActivity } from "./ChatActivity"
import { ChatBackpressure } from "../ChatSendQueue"
import { ChatSendQueue } from "../ChatSendQueue"
import { silentLogger } from "../../../tests/fixtures"
import type { ConvexService } from "../ConvexService"
import { TwitchApiService, TwitchFailure } from "../TwitchApiService"
import { apiConfig } from "../../../tests/fixtures"
import { createHmac } from "node:crypto"
import { TwitchWebhookServer } from "../eventsub/TwitchWebhookServer"

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
    settleTimer: async (_id, _execution, success, _definite, state) => {
      if (settleFailure) throw new Error("down")
      settled.push(success)
      if (state) states.push(state)
      return null
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

test("simultaneous broadcasters receive fresh fair admissions across the fourth global slot and repeated intervals", async (t) => {
  for (const count of [1, 2, 3, 4, 7]) {
    const s = setup()
    const clock = t.mock.method(Date, "now", s.now)
    const groups = Array.from({ length: count }, (_, i) => ({
      ...group,
      id: `group-${i}`,
      broadcasterId: String(300 + i),
      minimumMessages: 1,
    }))
    s.changes(groups)
    const live = new Map(
      groups.map((g) => [g.broadcasterId, { id: "100", startedAt: 900000 }])
    )
    t.mock.method(s.provider, "liveBroadcasters", async () => live)
    const cursors = new Map(groups.map((g) => [g.id, 0]))
    const posts: { channel: string; message: string; at: number }[] = []
    const api = new TwitchApiService(apiConfig, async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      posts.push({
        channel: body.broadcaster_id,
        message: body.message,
        at: s.now(),
      })
      return Response.json({
        data: [{ message_id: "confirmed", is_sent: true }],
      })
    })
    Object.defineProperty(api, "sends", {
      value: new ChatSendQueue(s.abort.signal, s.now, async (ms) =>
        s.advance(ms)
      ),
    })
    t.mock.method(s.provider, "sendChatMessage", api.sendChatMessage.bind(api))
    t.mock.method(s.convex, "claimTimer", async (id: string) => ({
      executionId: id,
      message: cursors.get(id) ? "second" : "first",
      expiresAt: s.now() + 60000,
    }))
    const begins = t.mock.method(s.convex, "beginTimer", async () => true)
    t.mock.method(
      s.convex,
      "settleTimer",
      async (id: string, _execution: string, sent: boolean) => {
        assert.equal(
          sent,
          true,
          "healthy admitted work must not lose its queue slot"
        )
        cursors.set(id, 1 - cursors.get(id)!)
        return s.now() + 300000
      }
    )
    await s.scheduler.tick()
    for (let cycle = 0; cycle < 4; cycle++) {
      s.advance(300000)
      for (let tick = 0; tick < 2; tick++) {
        for (const g of groups)
          s.activity.observe(
            g.broadcasterId,
            "viewer",
            `${cycle}:${tick}`,
            s.now()
          )
        await s.scheduler.tick()
        s.advance(15000)
      }
    }
    assert.equal(posts.length, count * 4)
    assert.equal(begins.mock.callCount(), posts.length)
    for (const g of groups)
      assert.deepEqual(
        posts
          .filter((p) => p.channel === g.broadcasterId)
          .map((p) => p.message),
        ["first", "second", "first", "second"]
      )
    for (let i = 1; i < posts.length; i++)
      assert.ok(posts[i]!.at - posts[i - 1]!.at >= 1700)
    if (count >= 4) assert.equal(posts[3]!.at - posts[0]!.at, 5100)
    await s.scheduler.stop()
    clock.mock.restore()
  }
})

test("a timer ages fairly through durable alert pressure and refreshes evidence without reclaiming or replaying a POST", async (tc) => {
  for (const alertCount of [1, 4]) {
    const s = setup()
    const clock = tc.mock.method(Date, "now", s.now)
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const posts: { message: string; at: number }[] = []
    const api = new TwitchApiService(apiConfig, async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      posts.push({ message: body.message, at: s.now() })
      if (body.message === "alert-0") await held
      return Response.json({ data: [{ message_id: "sent", is_sent: true }] })
    })
    Object.defineProperty(api, "sends", {
      value: new ChatSendQueue(s.abort.signal, s.now, async (ms) =>
        s.advance(ms)
      ),
    })
    let armed = false
    const alerts: Promise<string>[] = []
    tc.mock.method(s.provider, "liveBroadcasters", async () => {
      if (armed) {
        armed = false
        for (let i = 0; i < alertCount; i++)
          alerts.push(
            api.sendChatMessage(
              "app",
              alertCount === 1 ? "222" : String(500 + i),
              `alert-${i}`
            )
          )
      }
      return new Map([["222", { id: "100", startedAt: 900000 }]])
    })
    tc.mock.method(
      s.provider,
      "sendChatMessage",
      async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
        const work = api.sendChatMessage(...args)
        release()
        return work
      }
    )
    const claims = tc.mock.method(s.convex, "claimTimer")
    const begins = tc.mock.method(s.convex, "beginTimer")
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    armed = true
    await s.scheduler.tick()
    await Promise.all(alerts)
    assert.equal(claims.mock.callCount(), 1)
    assert.equal(begins.mock.callCount(), 1)
    assert.equal(posts.filter((p) => p.message === "first").length, 1)
    assert.equal(
      posts.filter((p) => p.message.startsWith("alert-")).length,
      alertCount
    )
    for (let i = 1; i < posts.length; i++)
      assert.ok(posts[i]!.at - posts[i - 1]!.at >= 1700)
    assert.deepEqual(s.settled, [true])
    await s.scheduler.stop()
    clock.mock.restore()
  }
})

test("serial admission stops further claims after shutdown or stale control-plane evidence", async (tc) => {
  for (const mode of ["stop", "abort", "stale"] as const) {
    const s = setup()
    s.changes([group, { ...group, id: "another", broadcasterId: "333" }])
    tc.mock.method(
      s.provider,
      "liveBroadcasters",
      async () =>
        new Map(
          ["222", "333"].map((id) => [id, { id: "100", startedAt: 900000 }])
        )
    )
    const claims = tc.mock.method(s.convex, "claimTimer")
    tc.mock.method(
      s.provider,
      "sendChatMessage",
      async (
        _token: string,
        _channel: string,
        _message: string,
        gate?: () => boolean | Promise<boolean>
      ) => {
        assert.equal(await gate!(), true)
        if (mode === "stop") s.scheduler.stopAccepting()
        else if (mode === "abort") s.abort.abort()
        else s.advance(60001)
        return "confirmed"
      }
    )
    await s.scheduler.tick()
    s.advance(300000)
    for (const id of ["222", "333"])
      for (let i = 0; i < 2; i++)
        s.activity.observe(id, "viewer", `${i}`, s.now())
    await s.scheduler.tick()
    assert.equal(claims.mock.callCount(), 1)
    assert.deepEqual(s.settled, [true])
    await s.scheduler.stop()
  }
})

test("a later admission respects an offline or new-stream transition during the preceding POST", async (tc) => {
  for (const online of [false, true]) {
    const s = setup()
    let changed = false
    s.changes([group, { ...group, id: "another", broadcasterId: "333" }])
    tc.mock.method(
      s.provider,
      "liveBroadcasters",
      async () =>
        new Map(
          ["222", "333"].map((id) => [
            id,
            {
              id: id === "333" && changed ? "101" : "100",
              startedAt: id === "333" && changed ? s.now() : 900000,
            },
          ])
        )
    )
    const claims = tc.mock.method(s.convex, "claimTimer")
    const eligible = tc.mock.method(s.activity, "eligible")
    const diagnostics = tc.mock.method(s.convex, "diagnoseTimer")
    tc.mock.method(
      s.provider,
      "sendChatMessage",
      async (
        _token: string,
        _channel: string,
        _message: string,
        gate?: () => boolean | Promise<boolean>
      ) => {
        assert.equal(await gate!(), true)
        s.advance(1)
        changed = true
        await s.scheduler.lifecycle("333", online, s.now())
        for (let i = 0; i < 2; i++)
          s.activity.observe("333", "viewer", `new-${i}`, s.now())
        return "confirmed"
      }
    )
    await s.scheduler.tick()
    s.advance(300000)
    for (const id of ["222", "333"])
      for (let i = 0; i < 2; i++)
        s.activity.observe(id, "viewer", `${i}`, s.now())
    await s.scheduler.tick()
    assert.equal(claims.mock.callCount(), 1)
    assert.equal(
      eligible.mock.calls.some((call) => call.arguments[0] === "333"),
      false
    )
    assert.equal(
      diagnostics.mock.calls.some((call) => call.arguments[0] === "another"),
      false
    )
    await s.scheduler.stop()
  }
})

test("local queue outcomes remain distinct from Twitch rate limits and stale readmission stays bounded", async (tc) => {
  for (const reason of ["capacity", "deadline", "shutdown", "stale"] as const) {
    const s = setup()
    const claims = tc.mock.method(s.convex, "claimTimer")
    const begins = tc.mock.method(s.convex, "beginTimer")
    let admissions = 0
    tc.mock.method(
      s.provider,
      "sendChatMessage",
      async (
        _token: string,
        _channel: string,
        _message: string,
        gate?: () => boolean | Promise<boolean>
      ) => {
        admissions++
        if (reason === "stale") {
          s.advance(2000)
          assert.equal(await gate!(), false)
          return ""
        }
        throw new ChatBackpressure(reason)
      }
    )
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    await s.scheduler.tick()
    assert.equal(claims.mock.callCount(), 1)
    assert.equal(begins.mock.callCount(), 0)
    assert.equal(
      admissions,
      reason === "deadline" || reason === "stale" ? 2 : 1
    )
    assert.equal(
      s.states.at(-1),
      reason === "capacity"
        ? "queueBusy"
        : reason === "shutdown"
          ? "intervalPending"
          : "queueExpired"
    )
    assert.deepEqual(s.settled, [false])
    await s.scheduler.stop()
  }
})

test("a late rejected claim cannot replace a newer stream's deadline or diagnostics", async (tc) => {
  for (const rejected of [false, true]) {
    const s = setup()
    await s.scheduler.tick()
    let expected = 0
    const diagnose = tc.mock.method(s.convex, "diagnoseTimer")
    tc.mock.method(s.convex, "claimTimer", async () => {
      s.advance(1)
      tc.mock.method(
        s.provider,
        "liveBroadcasters",
        async () => new Map([["222", { id: "101", startedAt: s.now() }]])
      )
      await s.scheduler.lifecycle("222", true, s.now())
      expected = s.now() + 300000
      s.advance(30000)
      if (rejected) throw new Error("old action unavailable")
      return null
    })
    s.advance(300000)
    s.chat()
    await s.scheduler.tick()
    const entries: Map<string, { dueAt: number }> = Reflect.get(
      s.scheduler,
      "groups"
    )
    assert.equal(entries.get("group")?.dueAt, expected)
    assert.equal(diagnose.mock.callCount(), 0)
    await s.scheduler.stop()
  }
})

test("signed lifecycle notifications tolerate bounded skew without extending observations or resurrecting old sessions", async (tc) => {
  for (const skew of [0, 20000, 60000]) {
    const s = setup()
    s.live(false)
    await s.scheduler.tick()
    let live = true
    const startedAt = s.now() + skew
    let providerStart = startedAt,
      streamId = "101"
    tc.mock.method(
      s.provider,
      "liveBroadcasters",
      async () =>
        new Map(
          live ? [["222", { id: streamId, startedAt: providerStart }]] : []
        )
    )
    const server = new TwitchWebhookServer(
      "clock-test",
      {
        reserve: async () => ({ kind: "terminal" }),
        begin: async () => false,
        finish: async () => {},
        subscriptionState: async () => {},
        pendingEvents: async () => ({ events: [], cursor: null }),
      },
      { dispatch: async () => {} },
      silentLogger,
      s.activity,
      "999",
      s.scheduler.lifecycle.bind(s.scheduler)
    )
    const deliver = async (online: boolean, eventAt: number, id: string) => {
      const broadcaster = {
        broadcaster_user_id: "222",
        broadcaster_user_login: "channel",
        broadcaster_user_name: "Channel",
      }
      const body = JSON.stringify({
        subscription: {
          id: "lifecycle",
          type: online ? "stream.online" : "stream.offline",
          version: "1",
          condition: { broadcaster_user_id: "222" },
        },
        event: online
          ? {
              ...broadcaster,
              id: "101",
              type: "live",
              started_at: new Date(startedAt).toISOString(),
            }
          : broadcaster,
      })
      const timestamp = new Date(eventAt).toISOString()
      const signature = createHmac("sha256", "clock-test")
        .update(id + timestamp + body)
        .digest("hex")
      const response = await server.handle(
        new Request("http://localhost/eventsub", {
          method: "POST",
          body,
          headers: {
            "Twitch-Eventsub-Message-Id": id,
            "Twitch-Eventsub-Message-Timestamp": timestamp,
            "Twitch-Eventsub-Message-Signature": `sha256=${signature}`,
            "Twitch-Eventsub-Message-Type": "notification",
          },
        }),
        s.now()
      )
      await server.drain()
      return response.status
    }
    assert.equal(await deliver(true, startedAt, "online"), 204)
    const sessions: Map<string, { id: string; observedAt: number }> =
      Reflect.get(s.scheduler, "sessions")
    assert.equal(sessions.get("222")?.id, "101")
    assert.equal(sessions.get("222")?.observedAt, s.now())
    const entries: Map<string, { group: TimerRuntimeGroup }> = Reflect.get(
      s.scheduler,
      "groups"
    )
    assert.equal(entries.get("group")?.group.cursor, 0)
    // A later provider observation can establish B before A's delayed signed
    // offline event arrives. Compare provider start time in Twitch's clock domain.
    s.advance(10)
    providerStart = startedAt + 10
    streamId = "102"
    await Reflect.get(s.scheduler, "reconcile").call(s.scheduler, ["222"])
    s.chat()
    assert.equal(s.activity.snapshot("222").count, 2)
    assert.equal(await deliver(false, startedAt + 5, "old-offline"), 204)
    assert.equal(sessions.get("222")?.id, "102")
    assert.equal(s.activity.snapshot("222").count, 2)
    s.advance(1)
    live = false
    assert.equal(await deliver(false, providerStart + 1, "offline"), 204)
    assert.equal(sessions.has("222"), false)
    assert.equal(s.activity.snapshot("222").count, 0)
    live = true
    assert.equal(await deliver(true, startedAt, "redelivery"), 204)
    assert.equal(sessions.has("222"), false)
    assert.equal(await deliver(true, s.now() + 60001, "excessive"), 403)
    assert.equal(sessions.has("222"), false)
    await server.stop()
    await s.scheduler.stop()
  }
})

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
  fresh.advance(15000)
  fresh.chat()
  await fresh.scheduler.tick()
  assert.deepEqual(fresh.sent, ["first", "first"])
  const calls = t.mock.method(fresh.provider, "liveBroadcasters")
  await fresh.scheduler.lifecycle("222", false, fresh.now() - 400000)
  assert.equal(calls.mock.callCount(), 0)
  await fresh.scheduler.lifecycle("222", true, fresh.now() + 60001)
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
        definite?: boolean,
        state?: string
      ) => {
        results.push(!!definite)
        assert.equal(
          state,
          status === 429
            ? "rateLimited"
            : status === 401 || status === 403
              ? "authorizationRevoked"
              : status === 400 || status === 422
                ? "failed"
                : "providerUnavailable"
        )
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
        error instanceof ChatBackpressure ? "queueBusy" : "providerUnavailable"
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
test("ambiguous POSTs quarantine while definite suppressions get a bounded retry", async (t) => {
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
    assert.equal(s.settled.length, mode === "postFailure" ? 1 : 2)
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

test("three same-channel groups rotate fairly across intervals under sustained chat and a rejected POST", async (t) => {
  const s = setup()
  t.mock.method(Date, "now", s.now)
  const groups = ["a", "b", "c", "other"].map((id) => ({
    ...group,
    id,
    broadcasterId: id === "other" ? "444" : "222",
    intervalMinutes: id === "c" ? 10 : 5,
    minimumMessages: id === "b" ? 5 : 100,
    messages: [`${id}:0`, `${id}:1`],
  }))
  s.changes(groups)
  const cursors = new Map(groups.map((g) => [g.id, 0]))
  const posts: { message: string; channel: string; at: number }[] = []
  let rejected = false
  const api = new TwitchApiService(apiConfig, async (_url, init) => {
    const value = JSON.parse(String(init?.body))
    posts.push({
      message: value.message,
      channel: value.broadcaster_id,
      at: s.now(),
    })
    if (!rejected && value.message === "a:0") {
      rejected = true
      return Response.json(
        {},
        {
          status: 429,
          headers: { "Ratelimit-Reset": String((Date.now() + 1000) / 1000) },
        }
      )
    }
    return Response.json({ data: [{ message_id: "confirmed", is_sent: true }] })
  })
  const queue = new ChatSendQueue(undefined, s.now, async (ms) => s.advance(ms))
  Object.defineProperty(api, "sends", { value: queue })
  t.mock.method(s.provider, "sendChatMessage", api.sendChatMessage.bind(api))
  t.mock.method(
    s.provider,
    "liveBroadcasters",
    async () =>
      new Map([
        ["222", { id: "100", startedAt: 900000 }],
        ["444", { id: "100", startedAt: 900000 }],
      ])
  )
  t.mock.method(s.convex, "claimTimer", async (id: string) => ({
    executionId: id,
    message: `${id}:${cursors.get(id)}`,
    expiresAt: s.now() + 60000,
  }))
  t.mock.method(
    s.convex,
    "settleTimer",
    async (id: string, _execution: string, sent: boolean) => {
      if (sent) cursors.set(id, 1 - cursors.get(id)!)
    }
  )
  await s.scheduler.tick()
  for (let tick = 0; tick < 100; tick++) {
    s.advance(15000)
    for (let message = 0; message < 1500; message++)
      for (const channel of ["222", "444"])
        s.activity.observe(channel, "viewer", `${tick}:${message}`, s.now())
    await s.scheduler.tick()
  }
  for (const id of cursors.keys()) {
    const messages = posts.filter((p) => p.message.startsWith(`${id}:`))
    assert.ok(messages.length >= 2, `${id} must send across multiple intervals`)
    assert.ok(messages.some((p) => p.message === `${id}:1`))
  }
  for (let i = 1; i < posts.length; i++)
    assert.ok(posts[i]!.at - posts[i - 1]!.at >= 1700)
  for (const channel of ["222", "444"]) {
    const sameChannel = posts.filter((p) => p.channel === channel)
    for (let i = 1; i < sameChannel.length; i++)
      assert.ok(sameChannel[i]!.at - sameChannel[i - 1]!.at >= 2000)
  }
  await s.scheduler.stop()
})

test("queue waiting and final provider checks remain prepared; the bounded begin gate cannot stall an alert", async (t) => {
  const s = setup()
  await s.scheduler.tick()
  let entered: () => void = () => {}
  const waiting = new Promise<void>((resolve) => {
    entered = resolve
  })
  const begins = t.mock.method(s.convex, "beginTimer", async () => {
    entered()
    return new Promise<boolean>(() => {})
  })
  const api = new TwitchApiService(apiConfig, async () =>
    Response.json({ data: [{ message_id: "alert", is_sent: true }] })
  )
  t.mock.method(s.provider, "sendChatMessage", api.sendChatMessage.bind(api))
  s.advance(300000)
  s.chat()
  const tick = s.scheduler.tick()
  // Before dequeue, preparation has not crossed the durable attempt boundary.
  assert.equal(begins.mock.callCount(), 0)
  await waiting
  const began = performance.now()
  const alert = api.sendChatMessage("app", "444", "alert")
  await tick
  assert.equal(begins.mock.callCount(), 1)
  assert.equal(await alert, "alert")
  assert.ok(
    performance.now() - began < 1500,
    "a stalled fence cannot hold an alert for the normal five-second timeout"
  )
  assert.deepEqual(s.settled, [false])
  await s.scheduler.stop()
})

test("definite dropped messages keep failed diagnostics and never advance rotation", async (t) => {
  const s = setup()
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  t.mock.method(
    s.provider,
    "sendChatMessage",
    async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
      await args[3]!()
      throw new TwitchFailure("messageDropped")
    }
  )
  await s.scheduler.tick()
  assert.deepEqual(s.sent, [])
  assert.ok(s.states.includes("failed"))
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

test("oversized incremental feeds resume bounded pages, remove tombstones and keep unrelated timers running", async (t) => {
  const s = setup()
  const healthy = { ...group, id: "healthy", broadcasterId: "444" }
  s.changes([
    group,
    healthy,
    { ...group, id: "deleted" },
    { ...group, id: "disabled" },
  ])
  t.mock.method(
    s.provider,
    "liveBroadcasters",
    async () =>
      new Map([
        ["222", { id: "100", startedAt: 900000 }],
        ["444", { id: "100", startedAt: 900000 }],
      ])
  )
  const cursors = new Map<string, number>()
  const claims: string[] = []
  t.mock.method(s.convex, "claimTimer", async (id: string) => {
    claims.push(id)
    return {
      executionId: id,
      message: ["first", "second"][cursors.get(id) ?? 0]!,
      expiresAt: s.now() + 60000,
    }
  })
  t.mock.method(
    s.convex,
    "settleTimer",
    async (id: string, _execution: string, sent: boolean) => {
      if (sent) cursors.set(id, 1 - (cursors.get(id) ?? 0))
      return null
    }
  )
  await s.scheduler.tick()
  const feed = [
    { ...group, id: "deleted", enabled: false, messages: [] },
    { ...group, id: "disabled", enabled: false },
    ...Array.from({ length: 11023 }, (_, i) => ({
      ...group,
      id: `history-${i}`,
      enabled: false,
      messages: [],
    })),
  ]
  let pageCalls = 0,
    completed = false
  const positions: number[] = []
  const snapshot = s.now() - 120000
  t.mock.method(
    s.convex,
    "timerPage",
    async (since?: number, cursor?: string, until?: number) => {
      pageCalls++
      if (completed)
        return {
          groups: [
            { ...group, cursor: cursors.get("group") ?? 0, revision: 2 },
            { ...healthy, cursor: cursors.get("healthy") ?? 0 },
          ],
          cursor: null,
          startedAt: s.now() - 120000,
        }
      const offset = Number(cursor ?? "0")
      positions.push(offset)
      if (cursor) assert.equal(until, snapshot + 120000)
      const next = offset + 100
      completed = next >= feed.length
      return {
        groups: feed.slice(offset, next),
        cursor: completed ? null : String(next),
        startedAt: snapshot,
      }
    }
  )
  for (let tick = 0; !completed; tick++) {
    s.advance(15000)
    s.chat()
    s.activity.observe("444", "viewer", `${tick}:a`, s.now())
    s.activity.observe("444", "viewer", `${tick}:b`, s.now())
    const before = pageCalls
    await s.scheduler.tick()
    assert.ok(pageCalls - before <= 4)
  }
  assert.ok(positions.length > 100)
  assert.equal(new Set(positions).size, positions.length)
  assert.ok(
    claims.includes("healthy"),
    "a tombstone backlog cannot expire unrelated scheduling"
  )
  assert.ok(!claims.includes("deleted") && !claims.includes("disabled"))
  s.advance(15000)
  await s.scheduler.tick()
  const groups: Map<string, { group: TimerRuntimeGroup }> = Reflect.get(
    s.scheduler,
    "groups"
  )
  assert.equal(
    groups.get("group")?.group.revision,
    2,
    "a concurrent edit is recovered by the next overlap"
  )
  assert.ok(groups.size <= 10000)
  await s.scheduler.stop()
  const activity = new ChatActivity("999")
  const restart = new TimerScheduler(
    s.convex,
    s.provider,
    { appToken: async () => "app" },
    activity,
    silentLogger,
    s.abort.signal,
    s.now
  )
  await restart.tick()
  assert.equal(activity.snapshot("222").count, 0)
  assert.equal((Reflect.get(restart, "groups") as Map<string, unknown>).size, 2)
  await restart.stop()
})

test("an old POST completion cannot change a new stream cursor, baseline or interval", async (t) => {
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
  let calls = 0
  t.mock.method(
    s.provider,
    "sendChatMessage",
    async (
      _token: string,
      _id: string,
      message: string,
      gate?: () => boolean | Promise<boolean>
    ) => {
      assert.equal(await gate!(), true)
      if (++calls === 1) {
        entered()
        await held
      }
      s.sent.push(message)
      return "confirmed"
    }
  )
  s.advance(300000)
  s.chat()
  const old = s.scheduler.tick()
  await waiting
  s.advance(1)
  await s.scheduler.lifecycle("222", false, s.now())
  s.advance(1)
  t.mock.method(
    s.provider,
    "liveBroadcasters",
    async () => new Map([["222", { id: "101", startedAt: s.now() }]])
  )
  await s.scheduler.lifecycle("222", true, s.now())
  s.chat()
  release()
  await old
  const groups: Map<
    string,
    { group: TimerRuntimeGroup; baseline: number; dueAt: number }
  > = Reflect.get(s.scheduler, "groups")
  assert.equal(groups.get("group")!.group.cursor, 0)
  assert.equal(groups.get("group")!.baseline, 0)
  assert.notEqual(groups.get("group")!.dueAt, Infinity)
  t.mock.method(s.convex, "claimTimer", async () => ({
    executionId: `new-${calls}`,
    message: calls === 1 ? "first" : "second",
    expiresAt: s.now() + 60000,
  }))
  for (let i = 0; i < 2; i++) {
    s.advance(300000)
    s.chat()
    await s.scheduler.tick()
  }
  assert.deepEqual(s.sent, ["first", "first", "second"])
  await s.scheduler.stop()
})

test("confirmed in-flight responses respect metadata replacement, deletion and shutdown", async (t) => {
  for (const mode of ["metadata", "delete", "stop"] as const) {
    const s = setup()
    await s.scheduler.tick()
    s.advance(300000)
    s.chat()
    const original = s.provider.sendChatMessage
    t.mock.method(
      s.provider,
      "sendChatMessage",
      async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
        const sent = await original(...args)
        if (mode === "stop") s.scheduler.stopAccepting()
        else {
          s.changes([
            { ...group, revision: 2, enabled: mode !== "delete", cursor: 0 },
          ])
          s.advance(15000)
          await Reflect.get(s.scheduler, "refresh").call(s.scheduler)
        }
        return sent
      }
    )
    await s.scheduler.tick()
    const entries: Map<string, { group: TimerRuntimeGroup }> = Reflect.get(
      s.scheduler,
      "groups"
    )
    assert.equal(
      entries.get("group")?.group.cursor,
      mode === "delete" ? undefined : 0
    )
    assert.deepEqual(s.settled, [true])
    await s.scheduler.stop()
  }
})

test("a six-minute definitive attempt uses the authoritative cooldown without premature claims or drift", async (t) => {
  for (const status of [429, 400, 401, 403, 422] as const) {
    const s = setup()
    s.changes([{ ...group, intervalMinutes: 6 }])
    await s.scheduler.tick()
    s.advance(360000)
    s.chat()
    const claims = t.mock.method(s.convex, "claimTimer")
    const attemptedAt = s.now()
    let failed = false
    const send = s.provider.sendChatMessage
    t.mock.method(
      s.provider,
      "sendChatMessage",
      async (...args: Parameters<TwitchApiService["sendChatMessage"]>) => {
        if (!failed) {
          failed = true
          assert.equal(await args[3]!(), true)
          throw new TwitchFailure("apiUnavailable", status)
        }
        return send(...args)
      }
    )
    t.mock.method(s.convex, "settleTimer", async () => {
      s.advance(2000)
      return attemptedAt + 360000
    })
    await s.scheduler.tick()
    for (const elapsed of [15000, 315000, 359999]) {
      s.advance(attemptedAt + elapsed - s.now())
      s.chat()
      await s.scheduler.tick()
      assert.equal(claims.mock.callCount(), 1)
    }
    s.advance(1)
    s.chat()
    await s.scheduler.tick()
    assert.equal(claims.mock.callCount(), 2)
    assert.deepEqual(s.sent, ["first"])
    await s.scheduler.stop()
  }
})

test("100 broadcaster reconciliation isolates failures, rejects stale observations and yields to sends", async (t) => {
  const s = setup()
  await s.scheduler.tick()
  s.changes(
    Array.from({ length: 100 }, (_, i) => ({
      ...group,
      id: i ? `group-${i}` : "group",
      broadcasterId: i ? String(300 + i) : "222",
    }))
  )
  let release: () => void = () => {},
    entered: () => void = () => {}
  const held = new Promise<void>((r) => {
      release = r
    }),
    waiting = new Promise<void>((r) => {
      entered = r
    })
  let slow = true,
    bad = true
  const seen = new Set<string>()
  t.mock.method(s.convex, "timerSession", async (id: string) => {
    seen.add(id)
    if (id === "301" && slow) {
      entered()
      await held
    }
    if (id === "302" && bad) throw new Error("one backend failed")
    return true
  })
  const get = t.mock.method(
    s.provider,
    "liveBroadcasters",
    async (_token: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { id: "100", startedAt: 900000 }]))
  )
  s.advance(300000)
  s.chat()
  const tick = s.scheduler.tick()
  await waiting
  await tick
  assert.equal(seen.size, 100)
  assert.deepEqual(
    s.sent,
    ["first"],
    "a slow session write does not hold normal sends"
  )
  s.advance(60001)
  slow = false
  bad = false
  release()
  await new Promise((r) => setImmediate(r))
  assert.equal(
    s.activity.snapshot("301").count,
    0,
    "stale live evidence cannot activate a channel"
  )
  s.advance(30000)
  await s.scheduler.tick()
  assert.ok(get.mock.callCount() >= 2)
  s.activity.observe("301", "viewer", "fresh", s.now())
  assert.equal(s.activity.snapshot("301").count, 1)
  await s.scheduler.stop()
})

test("provider reconciliation failures retry after bounded backoff and shutdown drains pending work", async (t) => {
  const s = setup()
  s.providerFailure(true)
  const get = t.mock.method(s.provider, "liveBroadcasters")
  await s.scheduler.tick()
  s.advance(29999)
  await s.scheduler.tick()
  assert.equal(get.mock.callCount(), 1)
  s.providerFailure(false)
  s.advance(1)
  await s.scheduler.tick()
  assert.equal(get.mock.callCount(), 2)
  s.chat()
  assert.equal(s.activity.snapshot("222").count, 2)
  await s.scheduler.stop()
  const failed = setup()
  const scheduler = new TimerScheduler(
    failed.convex,
    failed.provider,
    {
      appToken: async () => {
        throw new Error("token outage")
      },
    },
    failed.activity,
    silentLogger,
    failed.abort.signal,
    failed.now
  )
  await scheduler.tick()
  assert.equal(failed.activity.snapshot("222").count, 0)
  await scheduler.stop()
})

test("the active-group cap defers overflow without blocking feed progress and rescans after deletion", async (t) => {
  const s = setup()
  let rows = Array.from({ length: 10001 }, (_, i) => ({
    ...group,
    id: `active-${i}`,
  }))
  let finished = false
  t.mock.method(
    s.convex,
    "timerPage",
    async (_since?: number, cursor?: string) => {
      const offset = Number(cursor ?? 0),
        next = offset + 100
      finished = next >= rows.length
      return {
        groups: rows.slice(offset, next),
        cursor: finished ? null : String(next),
        startedAt: s.now() - 120000,
      }
    }
  )
  do {
    await s.scheduler.tick()
    s.advance(15000)
  } while (!finished)
  const groups: Map<string, unknown> = Reflect.get(s.scheduler, "groups")
  assert.equal(groups.size, 10000)
  assert.equal(groups.has("active-10000"), false)
  rows = [{ ...group, id: "active-0", enabled: false, messages: [] }]
  finished = false
  await s.scheduler.tick()
  s.advance(15000)
  rows = Array.from({ length: 10000 }, (_, i) => ({
    ...group,
    id: `active-${i + 1}`,
  }))
  finished = false
  do {
    await s.scheduler.tick()
    s.advance(15000)
  } while (!finished)
  assert.equal(groups.size, 10000)
  assert.equal(groups.has("active-10000"), true)
  assert.equal(groups.has("active-0"), false)
  await s.scheduler.stop()
})

test("confirmed pending settlements protect optimistic progress and a later feed repairs older timestamps", async () => {
  const s = setup()
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  s.settleFailure(true)
  await s.scheduler.tick()
  s.changes([{ ...group, cursor: 0, lastSentAt: 1 }])
  s.advance(15000)
  await s.scheduler.tick()
  const entries: Map<string, { group: TimerRuntimeGroup }> = Reflect.get(
    s.scheduler,
    "groups"
  )
  assert.equal(
    entries.get("group")!.group.cursor,
    1,
    "uncommitted confirmation cannot be undone by the feed"
  )
  s.settleFailure(false)
  s.advance(15000)
  await s.scheduler.tick()
  s.changes([{ ...group, cursor: 0, lastSentAt: 1 }])
  s.advance(15000)
  await s.scheduler.tick()
  assert.equal(
    entries.get("group")!.group.cursor,
    0,
    "the backend repairs divergence even without an increasing timestamp"
  )
  await s.scheduler.stop()
})

test("a settlement from an old stream does not suppress a new stream feed, and stale batches obtain fresh evidence", async (t) => {
  const s = setup()
  await s.scheduler.tick()
  s.advance(300000)
  s.chat()
  s.settleFailure(true)
  await s.scheduler.tick()
  s.advance(1)
  await s.scheduler.lifecycle("222", false, s.now())
  s.advance(1)
  t.mock.method(
    s.provider,
    "liveBroadcasters",
    async () => new Map([["222", { id: "101", startedAt: s.now() }]])
  )
  await s.scheduler.lifecycle("222", true, s.now())
  s.changes([{ ...group, streamId: "101", cursor: 0, lastSentAt: 1 }])
  s.advance(15000)
  await s.scheduler.tick()
  assert.equal(
    (
      Reflect.get(s.scheduler, "groups") as Map<
        string,
        { group: TimerRuntimeGroup }
      >
    ).get("group")!.group.cursor,
    0
  )
  await s.scheduler.stop()
  const stale = setup()
  let checks = 0
  t.mock.method(stale.provider, "liveBroadcasters", async () => {
    if (++checks === 1) stale.advance(55000)
    return new Map([["222", { id: "100", startedAt: 900000 }]])
  })
  await stale.scheduler.tick()
  assert.equal(stale.activity.snapshot("222").count, 0)
  stale.advance(30000)
  await stale.scheduler.tick()
  stale.chat()
  assert.equal(stale.activity.snapshot("222").count, 2)
  await stale.scheduler.stop()
})

test("failed lifecycle persistence retries safely and retired broadcasters release retry memory", async (t) => {
  const s = setup()
  await s.scheduler.tick()
  t.mock.method(s.convex, "timerSession", async () => {
    throw new Error("offline persistence outage")
  })
  s.advance(1)
  await s.scheduler.lifecycle("222", false, s.now())
  s.chat()
  assert.equal(s.activity.snapshot("222").count, 0)
  await s.scheduler.stop()
  const removed = setup()
  removed.providerFailure(true)
  await removed.scheduler.tick()
  removed.changes([{ ...group, enabled: false }])
  removed.advance(15000)
  await removed.scheduler.tick()
  assert.equal(
    (Reflect.get(removed.scheduler, "reconcileRetry") as Map<string, number>)
      .size,
    0
  )
  await removed.scheduler.stop()
})

test("late offline persistence failures cannot deactivate newer event or reconciliation evidence", async (t) => {
  for (const via of ["event", "reconciliation"] as const) {
    const s = setup()
    await s.scheduler.tick()
    let rejectOld: (reason: Error) => void = () => {}
    const held = new Promise<boolean>((_resolve, reject) => {
      rejectOld = reject
    })
    t.mock.method(
      s.convex,
      "timerSession",
      async (
        _id: string,
        _at: number,
        stream?: { id: string; startedAt: number }
      ) => (stream ? true : held)
    )
    s.advance(1)
    const old = s.scheduler.lifecycle("222", false, s.now())
    t.mock.method(
      s.provider,
      "liveBroadcasters",
      async () => new Map([["222", { id: "101", startedAt: s.now() }]])
    )
    if (via === "event") {
      s.advance(1)
      await s.scheduler.lifecycle("222", true, s.now())
    } else {
      s.advance(300000)
      await s.scheduler.tick()
    }
    s.chat()
    rejectOld(new Error("late failure"))
    await old
    assert.equal(s.activity.snapshot("222").count, 2)
    await s.scheduler.stop()
  }
})
