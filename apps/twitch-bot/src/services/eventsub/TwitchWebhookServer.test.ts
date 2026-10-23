import assert from "node:assert/strict"
import { test } from "node:test"
import { createHmac } from "node:crypto"
import { createServer, request as httpRequest, type Server } from "node:http"
import {
  TwitchWebhookServer,
  boundedBody,
  MAX_WEBHOOK_BYTES,
} from "./TwitchWebhookServer"
import { silentLogger } from "../../../tests/fixtures"
import { ChatActivity } from "../timers/ChatActivity"

const secret = "test-eventsub-secret"
test("verified stream lifecycle uses the existing listener without consuming Discord dispatch", async () => {
  const events: { online: boolean; eventAt: number }[] = []
  const f = fixture(undefined, undefined, async (_id, online, eventAt) => {
    events.push({ online, eventAt })
  })
  const now = Date.now(),
    timestamp = new Date(now).toISOString()
  const broadcaster = {
    broadcaster_user_id: "222",
    broadcaster_user_login: "channel",
    broadcaster_user_name: "Channel",
  }
  for (const online of [true, false]) {
    const notification = {
      subscription: {
        id: "stream",
        type: online ? "stream.online" : "stream.offline",
        version: "1",
        condition: { broadcaster_user_id: "222" },
      },
      event: online
        ? { ...broadcaster, id: "100", type: "live", started_at: timestamp }
        : broadcaster,
    }
    assert.equal(
      (await f.server.handle(request(notification, { timestamp }), now)).status,
      204
    )
  }
  await f.server.drain()
  assert.deepEqual(events, [
    { online: true, eventAt: now },
    { online: false, eventAt: now },
  ])
  assert.equal(
    f.calls.filter((value) =>
      JSON.stringify(value).includes('"dispatch":"streamOnline"')
    ).length,
    1
  )
  const withoutTimers = fixture()
  assert.equal(
    (
      await withoutTimers.server.handle(
        request({
          subscription: {
            id: "stream",
            type: "stream.offline",
            version: "1",
            condition: { broadcaster_user_id: "222" },
          },
          event: broadcaster,
        })
      )
    ).status,
    204
  )
  await f.server.stop()
  assert.equal(
    (await f.server.handle(new Request("http://localhost/healthz"))).status,
    503
  )
  await f.server.recoverPending()
})

test("shutdown interrupts recovery admission before an outstanding page returns", async () => {
  const convex = {
    reserve: async () => ({ kind: "pending" as const }),
    begin: async () => true,
    finish: async () => {},
    subscriptionState: async () => {},
    pendingEvents: async () => {
      server.stopAccepting()
      return { events: [], cursor: null }
    },
  }
  const server = new TwitchWebhookServer(
    secret,
    convex,
    { dispatch: async () => {} },
    silentLogger
  )
  await server.recoverPending()
  await server.stop()
})

test("delayed signed chat keeps its event timestamp and offline or future chat cannot count", async () => {
  const activity = new ChatActivity("111"),
    now = Date.now()
  activity.watch(["222"])
  activity.reset("222", now - 400000)
  const f = fixture(activity, "111")
  const eventAt = now - 299000
  assert.equal(
    (
      await f.server.handle(
        request(chatBody, { timestamp: new Date(eventAt).toISOString() }),
        now
      )
    ).status,
    204
  )
  assert.equal(activity.snapshot("222").lastAt, eventAt)
  assert.equal(activity.eligible("222", 0, 1, now + 2000), false)
  activity.watch([])
  await f.server.handle(request(chatBody), now)
  assert.equal(activity.snapshot("222").count, 0)
  activity.watch(["222"])
  await f.server.handle(
    request(chatBody, { timestamp: new Date(now + 60001).toISOString() }),
    now
  )
  assert.equal(activity.snapshot("222").count, 0)
  assert.deepEqual(f.calls, [])
})

test("verified Twitch chat timestamps tolerate a host clock twenty to sixty seconds behind", async () => {
  const activity = new ChatActivity("111")
  activity.watch(["222"])
  const f = fixture(activity, "111"),
    now = Date.now()
  for (const skew of [20000, 60000]) {
    const value = {
      ...chatBody,
      event: { ...chatBody.event, message_id: `skew-${skew}` },
    }
    assert.equal(
      (
        await f.server.handle(
          request(value, {
            id: `skew-${skew}`,
            timestamp: new Date(now + skew).toISOString(),
          }),
          now
        )
      ).status,
      204
    )
  }
  assert.deepEqual(activity.snapshot("222"), { count: 2, lastAt: now })
  assert.equal(activity.eligible("222", 0, 2, now), true)
  await f.server.stop()
})
const event = {
  broadcaster_user_id: "222",
  broadcaster_user_login: "channel",
  broadcaster_user_name: "Channel",
  user_name: "Viewer",
}
const body = {
  subscription: {
    id: "sub-id",
    type: "channel.follow",
    version: "2",
    condition: { broadcaster_user_id: "222", moderator_user_id: "222" },
  },
  event,
}
const chatBody = {
  subscription: {
    id: "chat-sub",
    type: "channel.chat.message",
    version: "1",
    condition: { broadcaster_user_id: "222", user_id: "111" },
  },
  event: {
    ...event,
    chatter_user_id: "333",
    message_id: "chat",
    message: { text: "private viewer text" },
  },
}

test("high-volume signed chat routes moderation with bounded concurrency and no durable per-message calls", async () => {
  const f = fixture()
  f.setFailure()
  const responses = await Promise.all(
    Array.from({ length: 1000 }, (_, i) =>
      f.server.handle(request(chatBody, { id: `chat-${i}` }))
    )
  )
  assert.ok(
    responses.every(
      (response) => response.status === 204 || response.status === 503
    )
  )
  assert.ok(f.chatCalls.length > 0 && f.chatCalls.length <= 1000)
  assert.deepEqual(f.calls, [])
  assert.equal(
    (await f.server.handle(request({ ...chatBody, event: {} }))).status,
    400
  )
  assert.equal(
    (
      await f.server.handle(
        request({
          ...chatBody,
          event: { ...chatBody.event, broadcaster_user_id: "444" },
        })
      )
    ).status,
    400
  )
  assert.equal(
    (
      await f.server.handle(
        request(chatBody, {
          headers: {
            "Twitch-Eventsub-Message-Signature": `sha256=${"0".repeat(64)}`,
          },
        })
      )
    ).status,
    403
  )
  assert.deepEqual(f.calls, [])
  await f.server.drain()
})
test("signed revocations retain identity for late callbacks after consumer cleanup", async () => {
  const f = fixture()
  for (const [type, condition, key] of [
    [
      "channel.chat.message",
      { broadcaster_user_id: "222", user_id: "111" },
      "chatMessage",
    ],
    ["channel.raid", { to_broadcaster_user_id: "222" }, "raid"],
  ] as const) {
    const notification = {
      subscription: {
        id: "retired-provider-id",
        type,
        version: "1",
        condition,
        status: "authorization_revoked",
      },
    }
    assert.equal(
      (await f.server.handle(request(notification, { type: "revocation" })))
        .status,
      204
    )
    assert.deepEqual(f.calls.at(-1), {
      state: ["retired-provider-id", true, key, "222", "authorization_revoked"],
    })
  }
  assert.equal(f.calls.length, 2)
  await f.server.drain()
})

function request(
  value: unknown = body,
  options: {
    id?: string
    type?: string
    timestamp?: string
    raw?: Uint8Array | string
    headers?: Record<string, string>
  } = {}
) {
  const raw = options.raw ?? JSON.stringify(value)
  const id = options.id ?? "message-id"
  const timestamp = options.timestamp ?? new Date().toISOString()
  const signature = createHmac("sha256", secret)
    .update(id + timestamp)
    .update(raw)
    .digest("hex")
  return new Request("http://localhost/eventsub", {
    method: "POST",
    body: typeof raw === "string" ? raw : new Uint8Array(raw).buffer,
    headers: {
      "Twitch-Eventsub-Message-Id": id,
      "Twitch-Eventsub-Message-Timestamp": timestamp,
      "Twitch-Eventsub-Message-Signature": `sha256=${signature}`,
      "Twitch-Eventsub-Message-Type": options.type ?? "notification",
      ...options.headers,
    },
  })
}
function fixture(
  activity?: ChatActivity,
  botId?: string,
  lifecycle?: (id: string, online: boolean, eventAt: number) => Promise<void>
) {
  const receipts = new Set<string>()
  const calls: unknown[] = []
  const chatCalls: unknown[] = []
  let fail = false
  let rejectDispatch = false
  const releases: (() => void)[] = []
  let stall = false
  const server = new TwitchWebhookServer(
    secret,
    {
      reserve: async (id, key, broadcaster) => {
        if (fail) throw new Error("unavailable")
        const duplicate = receipts.has(id)
        receipts.add(id)
        calls.push({ reserve: id, key, broadcaster })
        return duplicate
          ? { kind: "terminal" as const }
          : { kind: "pending" as const, template: "Hello {user}" }
      },
      begin: async () => true,
      finish: async () => {},
      pendingEvents: async () => ({ events: [], cursor: null }),
      subscriptionState: async (...args) => {
        if (fail) throw new Error("unavailable")
        calls.push({ state: args })
      },
    },
    {
      dispatch: async (_parsed, key, id, template) => {
        if (key === "chatMessage") {
          chatCalls.push({ id })
          if (rejectDispatch) throw new Error("moderation unavailable")
          return
        }
        calls.push({ dispatch: key, id, template })
        if (stall)
          await new Promise<void>((resolve) => {
            releases.push(resolve)
          })
        if (rejectDispatch) throw new Error("send failed")
      },
    },
    silentLogger,
    activity,
    botId,
    lifecycle
  )
  return {
    server,
    calls,
    chatCalls,
    setFailure: () => {
      fail = true
    },
    setReject: () => {
      rejectDispatch = true
    },
    setStall: () => {
      stall = true
    },
    release: () => releases.forEach((release) => release()),
  }
}

test("validated chat counts unique viewer metadata only for the configured bot and recent deliveries", async () => {
  const activity = new ChatActivity("111")
  activity.watch(["222"])
  const f = fixture(activity, "111")
  assert.equal((await f.server.handle(request(chatBody))).status, 204)
  assert.equal((await f.server.handle(request(chatBody))).status, 204)
  assert.equal(activity.snapshot("222").count, 1)
  const wrong = {
    ...chatBody,
    subscription: {
      ...chatBody.subscription,
      condition: { broadcaster_user_id: "222", user_id: "444" },
    },
  }
  assert.equal((await f.server.handle(request(wrong))).status, 400)
  assert.equal(
    (
      await f.server.handle(
        request(chatBody, {
          timestamp: new Date(Date.now() - 360000).toISOString(),
        })
      )
    ).status,
    204
  )
  assert.equal(activity.snapshot("222").count, 1)
  assert.deepEqual(f.calls, [])
  await f.server.drain()
})

test("signed high-volume chat retains eligibility and rejects redelivery across unordered handlers", async () => {
  const activity = new ChatActivity("111")
  activity.watch(["222"])
  const f = fixture(activity, "111")
  const now = Date.now()
  let baseline = 0
  for (let batch = 0; batch < 3; batch++) {
    for (let i = 0; i < 3000; i++) {
      const eventAt = now + batch * 60000
      const value = {
        ...chatBody,
        event: { ...chatBody.event, message_id: `${batch}:${i}` },
      }
      const signed = request(value, {
        id: `${batch}:${i}`,
        timestamp: new Date(eventAt).toISOString(),
      })
      assert.equal((await f.server.handle(signed, eventAt)).status, 204)
    }
    const counted = activity.snapshot("222").count
    assert.equal(
      activity.eligible("222", baseline, 5, now + batch * 60000),
      true
    )
    baseline = counted
    for (let i = 2999; i >= 0; i--) {
      const eventAt = now + batch * 60000
      const value = {
        ...chatBody,
        event: { ...chatBody.event, message_id: `${batch}:${i}` },
      }
      await f.server.handle(
        request(value, {
          id: `${batch}:${i}`,
          timestamp: new Date(eventAt).toISOString(),
        }),
        eventAt
      )
    }
    assert.equal(activity.snapshot("222").count, counted)
    assert.equal(
      activity.eligible("222", baseline, 1, now + batch * 60000),
      false
    )
  }
  assert.deepEqual(f.calls, [])
  activity.watch([])
  assert.equal(activity.snapshot("222").count, 0)
  await f.server.stop()
})
test("valid challenge is returned verbatim, valid events dispatch once, revocations only report to Convex", async () => {
  const f = fixture()
  const challenge = await f.server.handle(
    request(
      { ...body, challenge: "provider-challenge" },
      { type: "webhook_callback_verification" }
    )
  )
  assert.equal(challenge.status, 200)
  assert.equal(await challenge.text(), "provider-challenge")
  assert.equal(
    (await f.server.handle(request(body, { type: "revocation" }))).status,
    204
  )
  assert.equal((await f.server.handle(request())).status, 204)
  assert.equal((await f.server.handle(request())).status, 204)
  await f.server.drain()
  assert.equal(
    f.calls.filter(
      (call) => typeof call === "object" && call && "dispatch" in call
    ).length,
    1
  )
  const online = {
    subscription: { ...body.subscription, type: "stream.online", version: "1" },
    event: {
      ...event,
      id: "9001",
      type: "live",
      started_at: new Date().toISOString(),
    },
  }
  const before = f.calls.length
  assert.equal(
    (await f.server.handle(request(online, { id: "stream" }))).status,
    204
  )
  assert.deepEqual(f.calls.slice(before), [
    { dispatch: "streamOnline", id: "stream", template: undefined },
  ])
  const raid = {
    subscription: {
      ...body.subscription,
      type: "channel.raid",
      version: "1",
      condition: { to_broadcaster_user_id: "222" },
    },
    event: {
      to_broadcaster_user_id: "222",
      to_broadcaster_user_name: "Channel",
      from_broadcaster_user_name: "Raider",
      viewers: 10,
    },
  }
  assert.equal(
    (await f.server.handle(request(raid, { id: "raid" }))).status,
    204
  )
  await f.server.drain()
})

test("pending dispatch resumes across restart, honors send reservation and never replays an ambiguous POST", async () => {
  const outcomes: { messageId: string; sent: boolean }[] = []
  let phase: "send" | "deny" | "fail" | "suppress" | "before" | "finishFail" =
    "send"
  let pending = true
  let failReserve = false
  let pages = 0
  let begins = 0
  let sends = 0
  const convex = {
    reserve: async () => {
      if (failReserve) throw new Error("unavailable")
      return pending
        ? { kind: "pending" as const, template: "Hi {user}" }
        : { kind: "terminal" as const }
    },
    begin: async () => {
      begins++
      pending = false
      return phase !== "deny"
    },
    finish: async (messageId: string, _attempt: string, sent: boolean) => {
      outcomes.push({ messageId, sent })
      if (phase === "finishFail") throw new Error("finish unavailable")
    },
    pendingEvents: async (cursor?: string) => {
      pages++
      return {
        events: cursor
          ? [
              {
                messageId: "ignored",
                key: "follow",
                broadcasterId: "222",
                eventJson: JSON.stringify(event),
              },
            ]
          : [
              {
                messageId: "unknown",
                key: "fake",
                broadcasterId: "222",
                eventJson: "{}",
              },
              {
                messageId: "recovered",
                key: "follow",
                broadcasterId: "222",
                eventJson: JSON.stringify(event),
              },
            ],
        cursor: cursor ? null : "next",
      }
    },
    subscriptionState: async () => {},
  }
  const server = new TwitchWebhookServer(
    secret,
    convex,
    {
      dispatch: async (_event, _key, _id, _template, beforeSend) => {
        if (phase === "before") throw new Error("render/auth unavailable")
        if (phase === "suppress") return
        if (await beforeSend!()) {
          sends++
          if (phase === "fail") throw new Error("ambiguous actual send")
        }
      },
    },
    silentLogger
  )
  await server.recoverPending()
  assert.equal(pages, 2)
  assert.equal(sends, 1)
  assert.deepEqual(outcomes, [{ messageId: "recovered", sent: true }])
  for (const current of [
    "deny",
    "fail",
    "suppress",
    "finishFail",
    "before",
  ] as const) {
    phase = current
    pending = true
    assert.equal(
      (await server.handle(request(body, { id: current }))).status,
      204
    )
    await server.drain()
  }
  assert.ok(outcomes.some((value) => value.messageId === "fail" && !value.sent))
  assert.ok(
    outcomes.some((value) => value.messageId === "suppress" && value.sent)
  )
  assert.equal(begins, 5)
  phase = "before"
  pending = true
  failReserve = false
  // A provider failure during preparation followed by failed durable re-read
  // leaves the stored payload recoverable, without authorizing any send.
  const original = convex.reserve
  convex.reserve = async () => {
    const result = await original()
    failReserve = true
    return result
  }
  assert.equal(
    (await server.handle(request(body, { id: "deferred" }))).status,
    204
  )
  await server.drain()
})

test("stream.online observes backpressure and shutdown waits for accepted backend work", async () => {
  const f = fixture()
  f.setStall()
  const online = {
    subscription: { ...body.subscription, type: "stream.online", version: "1" },
    event: {
      ...event,
      id: "9001",
      type: "live",
      started_at: new Date().toISOString(),
    },
  }
  const requests = Array.from({ length: 256 }, (_, i) =>
    f.server.handle(request(online, { id: `stream-${i}` }))
  )
  assert.equal(
    (await f.server.handle(request(online, { id: "overflow" }))).status,
    503
  )
  let stopped = false
  const stop = f.server.stop().then(() => {
    stopped = true
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(stopped, false)
  f.release()
  assert.ok(
    (await Promise.all(requests)).every((response) => response.status === 204)
  )
  await stop
})

test("oversized chunked HTTP request is rejected and disconnected without waiting for its final chunk", async () => {
  const f = fixture()
  await f.server.start(0)
  const address = (Reflect.get(f.server, "server") as Server).address()
  assert.ok(address && typeof address !== "string")
  await new Promise<void>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        path: "/eventsub",
        method: "POST",
      },
      (res) => {
        assert.equal(res.statusCode, 413)
        assert.equal(res.headers.connection, "close")
        res.resume()
        res.once("end", resolve)
      }
    )
    req.once("error", reject)
    req.write(Buffer.alloc(MAX_WEBHOOK_BYTES + 1))
    // Deliberately never end the request: the receiver must close it.
  })
  await f.server.stop()
})
test("signature, timestamp, replay window, route, payload and condition failures have no side effects", async () => {
  const f = fixture()
  assert.equal(
    (await f.server.handle(new Request("http://localhost/healthz"))).status,
    200
  )
  assert.equal(
    (await f.server.handle(new Request("http://localhost/other"))).status,
    404
  )
  assert.equal(
    (
      await f.server.handle(
        new Request("http://localhost/eventsub", { method: "POST" })
      )
    ).status,
    403
  )
  const invalidHeaders: Record<string, string>[] = [
    { "Twitch-Eventsub-Message-Id": "" },
    { "Twitch-Eventsub-Message-Id": "x".repeat(513) },
    { "Twitch-Eventsub-Message-Timestamp": "bad" },
    { "Twitch-Eventsub-Message-Timestamp": "2026-99-99T00:00:00Z" },
    { "Twitch-Eventsub-Message-Signature": "invalid" },
    { "Twitch-Eventsub-Message-Signature": `sha256=${"0".repeat(64)}` },
  ]
  for (const headers of invalidHeaders)
    assert.equal(
      (await f.server.handle(request(body, { headers }))).status,
      403
    )
  const now = Date.now()
  for (const delta of [-600001, 60001])
    assert.equal(
      (
        await f.server.handle(
          request(body, {
            timestamp: new Date(now + delta).toISOString(),
          }),
          now
        )
      ).status,
      403
    )
  for (const input of [
    { ...body, subscription: { ...body.subscription, type: "fake.host" } },
    { ...body, event: {} },
    {
      ...body,
      subscription: {
        ...body.subscription,
        condition: { broadcaster_user_id: "333" },
      },
    },
  ])
    assert.equal((await f.server.handle(request(input))).status, 400)
  assert.equal(
    (await f.server.handle(request(body, { type: "wrong" }))).status,
    400
  )
  assert.equal(
    (
      await f.server.handle(
        request(body, { type: "webhook_callback_verification" })
      )
    ).status,
    400
  )
  assert.equal(
    (await f.server.handle(request(body, { raw: "not json" }))).status,
    400
  )
  assert.equal(
    (await f.server.handle(request(body, { raw: new Uint8Array([255]) })))
      .status,
    400
  )
  assert.equal(
    (
      await f.server.handle(
        request(body, { raw: "x".repeat(MAX_WEBHOOK_BYTES + 1) })
      )
    ).status,
    413
  )
  assert.equal(f.calls.length, 0)
  assert.equal(
    (await boundedBody(new Request("http://localhost"))).byteLength,
    0
  )
})
test("backend failures retry before reservation; side effect failures after reservation never replay", async () => {
  const f = fixture()
  f.setFailure()
  assert.equal((await f.server.handle(request())).status, 503)
  assert.equal(
    (await f.server.handle(request(body, { type: "revocation" }))).status,
    503
  )
  assert.equal(
    (
      await f.server.handle(
        request(
          { ...body, challenge: "challenge" },
          { type: "webhook_callback_verification" }
        )
      )
    ).status,
    200
  )
  await f.server.drain()
  const rejected = fixture()
  rejected.setReject()
  assert.equal((await rejected.server.handle(request())).status, 204)
  await rejected.server.drain()
  assert.equal((await rejected.server.handle(request())).status, 204)
})
test("HTTP service binds loopback with bounded raw-body ingestion and closes cleanly", async (t) => {
  const f = fixture()
  assert.equal(f.server.isListening, false)
  await f.server.start(0)
  const native = Reflect.get(f.server, "server") as Server
  const address = native.address()
  assert.ok(address && typeof address !== "string")
  assert.equal(address.address, "127.0.0.1")
  const url = `http://127.0.0.1:${address.port}`
  assert.equal((await fetch(`${url}/healthz`)).status, 200)
  const signed = request()
  assert.equal(
    (
      await fetch(`${url}/eventsub`, {
        method: "POST",
        headers: signed.headers,
        body: await signed.text(),
      })
    ).status,
    204
  )
  assert.equal(
    (
      await fetch(`${url}/eventsub`, {
        method: "POST",
        body: "x".repeat(MAX_WEBHOOK_BYTES + 1),
      })
    ).status,
    413
  )
  assert.equal(f.server.isListening, true)
  const handle = t.mock.method(f.server, "handle", async () => {
    throw new Error("unexpected")
  })
  assert.equal((await fetch(`${url}/healthz`)).status, 503)
  handle.mock.restore()
  const close = t.mock.method(
    native,
    "close",
    (callback?: (error?: Error) => void) => {
      callback?.(new Error("close failed"))
      return native
    }
  )
  await assert.rejects(f.server.stop(), /close failed/)
  close.mock.restore()
  await f.server.stop()
  assert.equal(f.server.isListening, false)
  const occupied = createServer()
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve))
  const taken = occupied.address()
  assert.ok(taken && typeof taken !== "string")
  await assert.rejects(f.server.start(taken.port))
  await f.server.drain()
  await new Promise<void>((resolve) => occupied.close(() => resolve()))
})
test("bounded in-flight handlers apply backpressure and drain before shutdown", async () => {
  const f = fixture()
  f.setStall()
  for (let n = 0; n < 256; n++)
    assert.equal(
      (await f.server.handle(request(body, { id: `message-${n}` }))).status,
      204
    )
  assert.equal(
    (await f.server.handle(request(body, { id: "overflow" }))).status,
    503
  )
  assert.equal(
    (
      await f.server.handle(
        request(
          { ...body, challenge: "challenge" },
          { type: "webhook_callback_verification" }
        )
      )
    ).status,
    503
  )
  f.release()
  await f.server.drain()
  const raid = {
    subscription: {
      ...body.subscription,
      type: "channel.raid",
      version: "1",
      condition: { to_broadcaster_user_id: "222" },
    },
    challenge: "raid-challenge",
  }
  assert.equal(
    (
      await f.server.handle(
        request(raid, { type: "webhook_callback_verification" })
      )
    ).status,
    200
  )
  await f.server.drain()
})
