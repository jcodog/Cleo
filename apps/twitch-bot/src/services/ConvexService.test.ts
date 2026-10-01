import assert from "node:assert/strict"
import { test } from "node:test"
import { ConvexService, ConvexActionError } from "./ConvexService"
import { httpFake, json } from "../../tests/fixtures"
test("focused event actions authenticate once and return durable dedupe plus template in one round trip", async () => {
  const requests: { path: string; args: Record<string, unknown> }[] = []
  const service = new ConvexService(
    "https://test.convex.cloud",
    "worker-secret",
    httpFake((url, init) => {
      assert.equal(url.pathname, "/api/action")
      assert.equal(init.method, "POST")
      const body = JSON.parse(String(init.body))
      requests.push(body)
      return json({
        status: "success",
        value: body.path.endsWith("reserveEvent")
          ? { kind: "pending", template: "Hello {user}" }
          : null,
      })
    })
  )
  assert.deepEqual(await service.reserve("id", "follow", "222"), {
    kind: "pending",
    template: "Hello {user}",
  })
  await service.streamOnline("stream-id", { id: "9001" })
  await service.subscriptionState("sub-id", true)
  assert.equal(requests.length, 3)
  assert.ok(
    requests.every((request) => request.args.secret === "worker-secret")
  )
  for (const response of [
    json({}, 503),
    json({ status: "error" }),
    json({ status: "success", value: {} }),
  ]) {
    await assert.rejects(
      new ConvexService(
        "https://test.convex.cloud",
        "secret",
        httpFake(() => response)
      ).reserve("id", "follow", "222")
    )
  }
})

test("dispatch lifecycle uses focused authenticated actions and forwards shutdown", async () => {
  const signal = new AbortController()
  const calls: { path: string; args: Record<string, unknown> }[] = []
  const service = new ConvexService(
    "https://test.convex.cloud",
    "never-log-secret",
    httpFake((_url, init) => {
      assert.ok(init.signal)
      const body = JSON.parse(String(init.body))
      calls.push(body)
      return json({
        status: "success",
        value: body.path.endsWith("beginDispatch")
          ? true
          : body.path.endsWith("pendingEvents")
            ? { events: [], cursor: null }
            : null,
      })
    }),
    signal.signal
  )
  assert.equal(await service.begin("event", "attempt"), true)
  await service.finish("event", "attempt", true)
  assert.deepEqual(await service.pendingEvents("cursor"), {
    events: [],
    cursor: null,
  })
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "twitchEventSubActions:beginDispatch",
      "twitchEventSubActions:finishDispatch",
      "twitchEventSubActions:pendingEvents",
    ]
  )
  assert.equal(calls[2]?.args.cursor, "cursor")
})

test("action errors preserve safe status and backend codes without leaking response text or credentials", async (t) => {
  for (const [body, status, kind, code] of [
    [
      {
        status: "error",
        errorMessage: "Unauthorized Twitch worker. token=private",
      },
      401,
      "http",
      "unauthorizedWorker",
    ],
    [
      { status: "error", errorMessage: "Invalid event. viewer secret" },
      200,
      "backend",
      "invalidEvent",
    ],
    [
      { status: "error", errorMessage: "Twitch provider unavailable" },
      200,
      "backend",
      "providerUnavailable",
    ],
    [
      { status: "error", errorMessage: "unknown secret detail" },
      503,
      "http",
      undefined,
    ],
    [{}, 200, "backend", undefined],
    [{}, 403, "http", undefined],
  ] as const) {
    const service = new ConvexService(
      "https://test.convex.cloud",
      "worker-secret",
      httpFake(() => json(body, status))
    )
    await assert.rejects(service.streamOnline("id", {}), (error) => {
      assert.ok(error instanceof ConvexActionError)
      assert.equal(error.action, "liveNotificationActions:receiveOnline")
      assert.equal(error.kind, kind)
      assert.equal(error.status, status)
      assert.equal(error.backendCode, code)
      assert.doesNotMatch(error.message, /private|secret|viewer/)
      return true
    })
  }
  await assert.rejects(
    new ConvexService(
      "https://test.convex.cloud",
      "secret",
      httpFake(() => new Response("bad json", { status: 500 }))
    ).streamOnline("id", {}),
    /HTTP 500/
  )
  for (const timedOut of [false, true]) {
    const controller = new AbortController()
    if (timedOut) controller.abort()
    const timeout = t.mock.method(
      AbortSignal,
      "timeout",
      () => controller.signal
    )
    const service = new ConvexService(
      "https://test.convex.cloud",
      "secret",
      async () => {
        throw new Error("network secret")
      }
    )
    await assert.rejects(
      service.streamOnline("id", {}),
      (error) =>
        error instanceof ConvexActionError &&
        error.kind === (timedOut ? "timeout" : "network")
    )
    timeout.mock.restore()
  }
})
