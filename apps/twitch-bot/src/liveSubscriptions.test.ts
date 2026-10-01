import assert from "node:assert/strict"
import { test } from "node:test"
import { TwitchApi, TwitchFailure } from "./api"
import {
  loadLiveSources,
  reconcileLiveSubscriptions,
  publishLiveStates,
} from "./liveSubscriptions"
import { apiConfig, httpFake, json, subscription } from "../tests/fixtures"

const callback = subscription.transport.callback
const secret = "test-runtime-secret"
const online = {
  ...subscription,
  type: "stream.online",
  condition: { broadcaster_user_id: "222" },
}

test("runtime source contract is authenticated, bounded and rejects unavailable/malformed backend data", async (t) => {
  const request = httpFake((url, init) => {
    assert.equal(url.href, "https://test.convex.site/twitch-live-sources")
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      `Bearer ${secret}`
    )
    assert.equal(init.redirect, "error")
    assert.deepEqual(JSON.parse(String(init.body)), { states: [] })
    return json({ broadcasterIds: ["222", "333", "222"] })
  })
  t.mock.method(globalThis, "fetch", request)
  assert.deepEqual(await loadLiveSources(callback, secret, []), ["222", "333"])
  assert.deepEqual(
    await loadLiveSources(
      callback,
      secret,
      [],
      new AbortController().signal,
      request
    ),
    ["222", "333"]
  )
  await assert.rejects(
    loadLiveSources(
      callback,
      secret,
      [],
      undefined,
      httpFake(() => json({}, 503))
    ),
    /subscriptionUnavailable/
  )
  await assert.rejects(
    loadLiveSources(
      callback,
      secret,
      [],
      undefined,
      httpFake(() => json({ broadcasterIds: ["bad"] }))
    ),
    /malformedResponse/
  )
  await assert.rejects(
    loadLiveSources(
      callback,
      secret,
      [],
      undefined,
      httpFake(() => {
        throw new Error("offline")
      })
    ),
    /offline/
  )
})

test("live reconciliation keeps one enabled subscription, removes obsolete owned subscriptions and ignores other transports/versions", async () => {
  const removed: string[] = []
  const api = new TwitchApi(
    apiConfig,
    httpFake((url, init) => {
      if (init.method === "DELETE") {
        removed.push(url.searchParams.get("id") ?? "")
        return new Response(null, { status: 204 })
      }
      return json({
        data: [
          online,
          {
            ...online,
            id: "duplicate",
            status: "webhook_callback_verification_pending",
          },
          {
            ...online,
            id: "obsolete",
            condition: { broadcaster_user_id: "333" },
          },
          { ...online, id: "no-broadcaster", condition: {} },
          subscription,
          { ...online, id: "websocket", transport: { method: "websocket" } },
          { ...online, id: "version", version: "2" },
        ],
      })
    })
  )
  assert.deepEqual(
    await reconcileLiveSubscriptions(
      api,
      "app",
      ["222", "222"],
      callback,
      secret
    ),
    [{ broadcasterId: "222", status: "ready" }]
  )
  assert.deepEqual(removed, ["obsolete", "no-broadcaster", "duplicate"])
})

test("live reconciliation creates stream.online v1 with app token, recovers pending/disabled states and bounds conflict recovery", async () => {
  for (const state of ["missing", "pending", "disabled", "conflict", "error"]) {
    const methods: string[] = []
    const api = new TwitchApi(
      apiConfig,
      httpFake((_url, init) => {
        methods.push(init.method ?? "GET")
        if (init.method === "DELETE") return new Response(null, { status: 204 })
        if (init.method === "POST") {
          assert.deepEqual(JSON.parse(String(init.body)), {
            type: "stream.online",
            version: "1",
            condition: { broadcaster_user_id: "222" },
            transport: { method: "webhook", callback, secret },
          })
          assert.equal(
            new Headers(init.headers).get("Authorization"),
            "Bearer app"
          )
          return json(
            { data: [] },
            state === "conflict" ? 409 : state === "error" ? 503 : 200
          )
        }
        return json({
          data:
            state === "pending"
              ? [{ ...online, status: "webhook_callback_verification_pending" }]
              : state === "disabled"
                ? [{ ...online, status: "authorization_revoked" }]
                : [],
        })
      })
    )
    if (state === "error" || state === "conflict")
      await assert.rejects(
        reconcileLiveSubscriptions(api, "app", ["222"], callback, secret),
        TwitchFailure
      )
    else
      assert.deepEqual(
        await reconcileLiveSubscriptions(api, "app", ["222"], callback, secret),
        [{ broadcasterId: "222", status: "pending" }]
      )
    assert.deepEqual(
      methods,
      state === "pending"
        ? ["GET"]
        : state === "disabled"
          ? ["GET", "DELETE", "POST"]
          : ["GET", "POST"]
    )
  }
})

test("callback rotation is operator-visible and never deletes or creates behind an obsolete callback", async () => {
  const methods: string[] = []
  const api = new TwitchApi(
    apiConfig,
    httpFake((_url, init) => {
      methods.push(init.method ?? "GET")
      return json({
        data: [
          {
            ...online,
            transport: {
              method: "webhook",
              callback: "https://old.convex.site/twitch-eventsub",
            },
          },
        ],
      })
    })
  )
  await assert.rejects(
    reconcileLiveSubscriptions(api, "app", ["222"], callback, secret),
    /callback mismatch/
  )
  assert.deepEqual(methods, ["GET"])
})

test("source pages and health batches support more than 500 broadcasters with bounded requests", async () => {
  const ids = Array.from({ length: 601 }, (_, i) => String(i + 1))
  const states = ids.map((broadcasterId) => ({
    broadcasterId,
    status: "ready" as const,
  }))
  let health = 0
  const request = httpFake((_url, init) => {
    const input = JSON.parse(String(init.body)) as {
      states: unknown[]
      healthOnly?: boolean
      cursor?: string
    }
    assert.ok(input.states.length <= 100)
    if (input.healthOnly) {
      health += input.states.length
      return json({})
    }
    const page = Number(input.cursor ?? 0)
    return json({
      broadcasterIds: ids.slice(page * 100, (page + 1) * 100),
      continueCursor: page === 6 ? null : String(page + 1),
    })
  })
  assert.deepEqual(
    await loadLiveSources(callback, secret, states, undefined, request),
    ids
  )
  assert.equal(health, 501)
  await publishLiveStates(
    callback,
    secret,
    states,
    new AbortController().signal,
    request
  )
  assert.equal(health, 1102)
  await assert.rejects(
    publishLiveStates(
      callback,
      secret,
      states,
      undefined,
      httpFake(() => json({}, 503))
    ),
    /subscriptionUnavailable/
  )
  await assert.rejects(
    loadLiveSources(
      callback,
      secret,
      [],
      undefined,
      httpFake(() => json({ broadcasterIds: [], continueCursor: "same" }))
    ),
    /malformedResponse/
  )
})
