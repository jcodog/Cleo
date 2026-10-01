import assert from "node:assert/strict"
import { test } from "node:test"

import { TwitchApiService, TwitchFailure } from "./TwitchApiService"
import {
  apiConfig,
  botToken,
  httpFake,
  json,
  validApp,
  validBot,
} from "../../tests/fixtures"
const fails = (code: string) => (error: unknown) =>
  error instanceof TwitchFailure && error.code === code

test("validation accepts documented arrays and observed null scopes without authorizing an unscoped bot", async () => {
  for (const scopes of [null, []]) {
    await new TwitchApiService(
      apiConfig,
      httpFake(() => json({ ...validApp, scopes }))
    ).validateAppToken("test-only-app")
    await assert.rejects(
      new TwitchApiService(
        apiConfig,
        httpFake(() => json({ ...validBot, scopes }))
      ).validateBotToken("test-only-access"),
      fails("missingScope")
    )
  }
  for (const scopes of [undefined, "user:bot", [1]])
    await assert.rejects(
      new TwitchApiService(
        apiConfig,
        httpFake(() => json({ ...validApp, scopes }))
      ).validateAppToken("test-only-app"),
      fails("malformedResponse")
    )
})

test("C1 message controls are rejected before any Twitch request", async () => {
  let requests = 0
  const api = new TwitchApiService(
    apiConfig,
    httpFake(() => {
      requests++
      return json({ data: [{ is_sent: true, message_id: "test-message" }] })
    })
  )
  for (const code of [127, 128, 133, 159])
    await assert.rejects(
      api.sendChatMessage(
        "test-only-app",
        "222",
        `hello${String.fromCharCode(code)}`
      ),
      /1-500/
    )
  assert.equal(requests, 0)
})

test("app tokens use client credentials, validate client/type and never request bot scopes", async () => {
  const calls: string[] = []
  const api = new TwitchApiService(
    apiConfig,
    httpFake((url, init) => {
      calls.push(url.pathname)
      assert.equal(init.redirect, "error")
      assert.ok(init.signal)
      if (url.pathname.endsWith("token")) {
        assert.equal(init.method, "POST")
        const form = new URLSearchParams(String(init.body))
        assert.equal(form.get("grant_type"), "client_credentials")
        assert.equal(form.get("client_id"), "test-client")
        assert.equal(form.get("scope"), null)
        return json({
          access_token: "test-only-app",
          expires_in: 1000,
          token_type: "bearer",
        })
      }
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        "OAuth test-only-app"
      )
      return json(validApp)
    })
  )
  assert.equal(await api.acquireAppToken(), "test-only-app")
  assert.deepEqual(calls, ["/oauth2/token", "/oauth2/validate"])
})

test("bot refresh and authorization exchange use encoded form bodies", async () => {
  const requests: URLSearchParams[] = []
  const api = new TwitchApiService(
    apiConfig,
    httpFake((_url, init) => {
      assert.equal(
        new Headers(init.headers).get("Content-Type"),
        "application/x-www-form-urlencoded"
      )
      requests.push(new URLSearchParams(String(init.body)))
      return json(botToken)
    })
  )
  await api.refreshBotToken("test-only-refresh%&+")
  await api.exchangeBotCode("test-only-code", "http://localhost:1234/callback")
  assert.equal(requests[0]?.get("refresh_token"), "test-only-refresh%&+")
  assert.equal(requests[1]?.get("grant_type"), "authorization_code")
  assert.equal(
    requests[1]?.get("redirect_uri"),
    "http://localhost:1234/callback"
  )
})

test("validation checks expected client, bot, scopes, expiry and app-token principal", async () => {
  await new TwitchApiService(
    apiConfig,
    httpFake(() => json(validBot))
  ).validateBotToken("test-only-access")
  for (const [patch, code] of [
    [{ client_id: "other" }, "wrongClient"],
    [{ user_id: "222" }, "wrongBot"],
    [{ scopes: ["user:bot"] }, "missingScope"],
    [{ expires_in: 0 }, "expiredToken"],
  ] as const) {
    await assert.rejects(
      new TwitchApiService(
        apiConfig,
        httpFake(() => json({ ...validBot, ...patch }))
      ).validateBotToken("test-only-access"),
      fails(code)
    )
  }
  await assert.rejects(
    new TwitchApiService(
      apiConfig,
      httpFake(() => json(validBot))
    ).validateAppToken("test-only-access"),
    fails("wrongClient")
  )
})

test("Twitch HTTP errors are typed, bounded and do not expose response bodies or thrown secrets", async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const api = new TwitchApiService(
      apiConfig,
      httpFake(() => json({ message: "test-only-secret-leak" }, status))
    )
    await assert.rejects(
      api.refreshBotToken("test-only-refresh"),
      (error: unknown) =>
        error instanceof TwitchFailure &&
        error.status === status &&
        !error.message.includes("secret-leak")
    )
  }
  const broken = new TwitchApiService(
    apiConfig,
    httpFake(() => {
      throw new Error("test-only-secret-leak")
    })
  )
  await assert.rejects(
    broken.validateBotToken("test-only-access"),
    fails("networkUnavailable")
  )
  const timeout = new TwitchApiService(
    { ...apiConfig, TWITCH_HTTP_TIMEOUT_MS: 5 },
    httpFake(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => undefined, 50)
          init.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer)
              reject(new Error("aborted"))
            },
            { once: true }
          )
        })
    )
  )
  await assert.rejects(
    timeout.validateBotToken("test-only-access"),
    fails("timeout")
  )
  for (const body of [{}, { expires_in: -1 }, []])
    await assert.rejects(
      new TwitchApiService(
        apiConfig,
        httpFake(() => json(body))
      ).acquireAppToken(),
      fails("malformedResponse")
    )
  await assert.rejects(
    new TwitchApiService(
      apiConfig,
      httpFake(() => new Response("invalid-json"))
    ).validateBotToken("test-only-access"),
    fails("malformedResponse")
  )
  const slowBody = new TwitchApiService(
    { ...apiConfig, TWITCH_HTTP_TIMEOUT_MS: 5 },
    httpFake(
      (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              const timer = setTimeout(() => undefined, 50)
              init.signal?.addEventListener(
                "abort",
                () => {
                  clearTimeout(timer)
                  controller.error(new Error("aborted body"))
                },
                { once: true }
              )
            },
          })
        )
    )
  )
  await assert.rejects(
    slowBody.validateBotToken("test-only-access"),
    fails("timeout")
  )
})

test("broadcaster lookup and explicit send have exact IDs, request shape and no retries", async () => {
  let sends = 0
  const api = new TwitchApiService(
    apiConfig,
    httpFake((url, init) => {
      if (url.pathname.endsWith("users")) {
        assert.equal(url.searchParams.get("id"), "222")
        assert.equal(
          new Headers(init.headers).get("Authorization"),
          "Bearer test-only-app"
        )
        return json({ data: [{ id: "222" }] })
      }
      sends++
      assert.equal(init.method, "POST")
      assert.deepEqual(JSON.parse(String(init.body)), {
        broadcaster_id: "222",
        sender_id: "111",
        message: "dude is online.",
      })
      const headers = new Headers(init.headers)
      assert.equal(headers.get("Authorization"), "Bearer test-only-bot")
      assert.equal(headers.get("Client-Id"), "test-client")
      return json({ data: [{ is_sent: true, message_id: "test-message" }] })
    })
  )
  await api.broadcasterExists("test-only-app", "222")
  assert.equal(
    await api.sendChatMessage("test-only-bot", "222", "dude is online."),
    "test-message"
  )
  assert.equal(sends, 1)
  await assert.rejects(
    new TwitchApiService(
      apiConfig,
      httpFake(() => json({ data: [] }))
    ).broadcasterExists("test-only-app", "222"),
    fails("broadcasterUnavailable")
  )
  for (const entry of [
    [],
    [{ is_sent: false, message_id: "" }],
    [{ is_sent: true, message_id: "" }],
  ])
    await assert.rejects(
      new TwitchApiService(
        apiConfig,
        httpFake(() => json({ data: entry }))
      ).sendChatMessage("test-only-app", "222", "dude is online."),
      fails("messageDropped")
    )
  for (const message of [
    "",
    " ",
    "a".repeat(501),
    "hello\nworld",
    "hello\u007f",
  ])
    await assert.rejects(
      api.sendChatMessage("test-only-app", "222", message),
      /1-500/
    )
  let attempts = 0
  await assert.rejects(
    new TwitchApiService(
      apiConfig,
      httpFake(() => {
        attempts++
        return json({}, 503)
      })
    ).sendChatMessage("test-only-app", "222", "dude is online.")
  )
  assert.equal(attempts, 1)
})
test("shutdown signal bounds API requests alongside their timeout", async () => {
  const controller = new AbortController()
  const api = new TwitchApiService(
    apiConfig,
    httpFake((_url, init) => {
      assert.ok(init.signal)
      return json(validBot)
    }),
    controller.signal
  )
  await api.validateBotToken("test-only-access")
})
