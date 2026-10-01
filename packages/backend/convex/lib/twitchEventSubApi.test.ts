import assert from "node:assert/strict"
import { test } from "node:test"
import { TwitchEventSubApi, EventSubProviderError } from "./twitchEventSubApi"
const config = {
  clientId: "client",
  clientSecret: "secret",
  secret: "webhook-secret",
  callback: "https://test.example/eventsub",
}
const row = {
  id: "subscription",
  type: "stream.online",
  version: "1",
  condition: { broadcaster_user_id: "222" },
  status: "enabled",
  transport: { method: "webhook", callback: config.callback },
}
test("control plane acquires app credentials, matches exact identity and creates or deletes with bounded requests", async () => {
  const requests: { url: string; init: RequestInit }[] = []
  let subscriptions: (typeof row)[] = []
  const request: typeof fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    assert.ok(init.signal)
    assert.equal(init.redirect, "error")
    if (String(url).includes("/oauth2/token")) {
      assert.equal(
        new URLSearchParams(String(init.body)).get("grant_type"),
        "client_credentials"
      )
      return Response.json({ access_token: "app" })
    }
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer app")
    if (init.method === "DELETE") {
      subscriptions = []
      return new Response(null, { status: 204 })
    }
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body))
      assert.equal(body.transport.secret, config.secret)
      subscriptions = [row]
      return Response.json({ data: subscriptions }, { status: 202 })
    }
    return Response.json({ data: subscriptions, pagination: {} })
  }
  const api = new TwitchEventSubApi(config, request)
  assert.equal(await api.acquireToken(), "app")
  assert.equal(await api.find("app", "streamOnline", row.condition), null)
  assert.equal(
    (await api.create("app", "streamOnline", row.condition)).id,
    row.id
  )
  assert.equal(
    (await api.find("app", "streamOnline", row.condition))?.id,
    row.id
  )
  for (const patch of [
    { type: "channel.follow" },
    { version: "2" },
    { condition: { broadcaster_user_id: "333" } },
    { condition: { broadcaster_user_id: "222", extra: "value" } },
    { transport: { method: "websocket", callback: config.callback } },
    {
      transport: {
        method: "webhook",
        callback: "https://other.example/eventsub",
      },
    },
  ]) {
    subscriptions = [{ ...row, ...patch }]
    assert.equal(await api.find("app", "streamOnline", row.condition), null)
  }
  subscriptions = [{ ...row, status: "authorization_revoked" }]
  assert.equal(await api.find("app", "streamOnline", row.condition), null)
  assert.equal(requests.at(-1)?.init.method, "DELETE")
  subscriptions = [{ ...row, status: "webhook_callback_verification_pending" }]
  assert.equal(
    (await api.find("app", "streamOnline", row.condition))?.id,
    row.id
  )
  await api.delete("app", row.id)
})
test("pagination, repeated cursors, conflict recovery and provider errors fail cleanly without leaking credentials", async () => {
  let n = 0
  const paginated = new TwitchEventSubApi(config, async (url) => {
    n++
    assert.equal(
      new URL(String(url)).searchParams.get("after"),
      n === 1 ? null : "next"
    )
    return Response.json(
      n === 1 ? { data: [], pagination: { cursor: "next" } } : { data: [row] }
    )
  })
  assert.ok(await paginated.find("app", "streamOnline", row.condition))
  await assert.rejects(
    new TwitchEventSubApi(config, async () =>
      Response.json({ data: [], pagination: { cursor: "same" } })
    ).find("app", "streamOnline", row.condition),
    (error) => error instanceof EventSubProviderError && error.kind === "failed"
  )
  const conflict = new TwitchEventSubApi(config, async (_url, init) =>
    init?.method === "POST"
      ? Response.json({}, { status: 409 })
      : Response.json({ data: [row] })
  )
  assert.equal(
    (await conflict.create("app", "streamOnline", row.condition)).id,
    row.id
  )
  for (const status of [400, 403, 429, 503]) {
    const api = new TwitchEventSubApi(config, async () =>
      Response.json({}, { status })
    )
    await assert.rejects(
      api.acquireToken(),
      (error) =>
        error instanceof EventSubProviderError &&
        error.kind ===
          (status >= 500 || status === 429 ? "providerUnavailable" : "failed")
    )
    await assert.rejects(api.delete("app", "sub"))
  }
  await new TwitchEventSubApi(
    config,
    async () => new Response(null, { status: 404 })
  ).delete("app", "gone")
  await assert.rejects(
    new TwitchEventSubApi(config, async () => {
      throw new Error("private-secret")
    }).acquireToken(),
    (error) =>
      error instanceof Error && !error.message.includes("private-secret")
  )
  await assert.rejects(
    new TwitchEventSubApi(config, async () =>
      Response.json({ data: [] })
    ).create("app", "streamOnline", row.condition)
  )
  for (const callback of [
    "http://test.example/eventsub",
    "https://test.example/wrong",
    "https://user:password@test.example/eventsub",
    "https://test.example:8443/eventsub",
    "https://test.example/eventsub?q=1",
    "https://test.example/eventsub#x",
  ])
    assert.throws(() => new TwitchEventSubApi({ ...config, callback }))
})

test("EventSub list pagination stops at 100 requests even with endless distinct cursors", async () => {
  let requests = 0
  const api = new TwitchEventSubApi(config, async () =>
    Response.json({ data: [], pagination: { cursor: `cursor-${++requests}` } })
  )
  await assert.rejects(
    api.find("app", "streamOnline", row.condition),
    (error) => error instanceof EventSubProviderError
  )
  assert.equal(requests, 100)
})
