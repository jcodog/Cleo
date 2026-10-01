import assert from "node:assert/strict"
import { test } from "node:test"
import { createHmac } from "node:crypto"
import { createServer, type Server } from "node:http"
import {
  TwitchWebhookServer,
  boundedBody,
  MAX_WEBHOOK_BYTES,
} from "./TwitchWebhookServer"
import { silentLogger } from "../../../tests/fixtures"

const secret = "test-eventsub-secret"
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
function fixture() {
  const receipts = new Set<string>()
  const calls: unknown[] = []
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
        return { duplicate, template: "Hello {user}" }
      },
      subscriptionState: async (...args) => {
        if (fail) throw new Error("unavailable")
        calls.push({ state: args })
      },
    },
    {
      dispatch: async (_parsed, key, id, template) => {
        calls.push({ dispatch: key, id, template })
        if (stall)
          await new Promise<void>((resolve) => {
            releases.push(resolve)
          })
        if (rejectDispatch) throw new Error("send failed")
      },
    },
    silentLogger
  )
  return {
    server,
    calls,
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
  await f.server.stop()
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
    503
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
  await f.server.stop()
  const rejected = fixture()
  rejected.setReject()
  assert.equal((await rejected.server.handle(request())).status, 204)
  await rejected.server.stop()
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
  await f.server.stop()
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
  await f.server.stop()
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
  await f.server.stop()
})
