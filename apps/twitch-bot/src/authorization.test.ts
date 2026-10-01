import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer, request } from "node:http"

import { BOT_SCOPES, TwitchApi } from "./api"
import {
  authorizationUrl,
  authorizeBot,
  parseAuthorizationCallback,
  waitForBotCode,
} from "./authorization"
import {
  apiConfig,
  botToken,
  httpFake,
  json,
  validBot,
  withGrant,
} from "../tests/fixtures"

async function unusedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Expected loopback address")
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  return address.port
}

test("operator authorization URL requests exact bot scopes and callback requires constant-time checked state", () => {
  const config = {
    ...apiConfig,
    TWITCH_BOT_REDIRECT_URI: "http://localhost:1234/callback",
  }
  const url = new URL(authorizationUrl(config, "test-state"))
  assert.equal(url.origin, "https://id.twitch.tv")
  assert.equal(url.searchParams.get("client_id"), "test-client")
  assert.equal(url.searchParams.get("scope"), BOT_SCOPES.join(" "))
  assert.equal(url.searchParams.get("state"), "test-state")
  assert.equal(url.searchParams.get("response_type"), "code")
  assert.equal(url.searchParams.has("client_secret"), false)
  const callback = (query: string, path = "/callback") =>
    parseAuthorizationCallback(
      new URL(`http://localhost:1234${path}?${query}`),
      "test-state"
    )
  assert.deepEqual(callback("state=test-state&code=test-code"), {
    status: "code",
    code: "test-code",
  })
  assert.deepEqual(callback("state=test-state&error=access_denied"), {
    status: "denied",
  })
  for (const query of [
    "",
    "state=bad&code=x",
    "state=otherstate&code=x",
    "state=test-state",
    `state=test-state&code=${"x".repeat(2049)}`,
  ])
    assert.deepEqual(callback(query), { status: "invalid" })
  assert.deepEqual(callback("state=test-state&code=x", "/wrong"), {
    status: "invalid",
  })
})

test("real operator callback rejects wrong state and method, accepts code without reflecting secrets", async () => {
  const port = await unusedPort()
  const redirect = `http://localhost:${port}/callback`
  let finished: Promise<void> | undefined
  const code = await waitForBotCode(
    redirect,
    "test-state",
    () => {
      finished = (async () => {
        assert.equal(
          await new Promise<number | undefined>((resolve, reject) => {
            const invalid = request(
              redirect,
              { path: "http://[" },
              (response) => {
                response.resume()
                resolve(response.statusCode)
              }
            )
            invalid.on("error", reject).end()
          }),
          403
        )
        assert.equal(
          (await fetch(`${redirect}?state=wrong&code=test-code`)).status,
          403
        )
        assert.equal(
          (
            await fetch(`${redirect}?state=test-state&code=test-code`, {
              method: "POST",
            })
          ).status,
          403
        )
        const response = await fetch(
          `${redirect}?state=test-state&code=test-code`
        )
        assert.equal(response.status, 200)
        assert.equal(response.headers.get("Cache-Control"), "no-store")
        assert.equal((await response.text()).includes("test-code"), false)
      })()
    },
    3000
  )
  await finished
  assert.equal(code, "test-code")
})

test("callback denial, timeout and unavailable local port fail cleanly", async () => {
  const port = await unusedPort()
  const redirect = `http://localhost:${port}/callback`
  let request: Promise<Response> | undefined
  await assert.rejects(
    waitForBotCode(
      redirect,
      "test-state",
      () => {
        request = fetch(`${redirect}?state=test-state&error=access_denied`)
      },
      3000
    ),
    /denied/
  )
  assert.equal((await request)?.status, 400)
  await assert.rejects(
    waitForBotCode(redirect, "test-state", () => undefined, 10),
    /timed out/
  )
  const server = createServer()
  await new Promise<void>((resolve) =>
    server.listen(port, "localhost", resolve)
  )
  try {
    await assert.rejects(
      waitForBotCode(redirect, "test-state", () => undefined, 3000),
      /Cannot bind/
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("operator exchanges server-side, validates the expected bot and saves privately", async () => {
  await withGrant(async (store) => {
    const urls: string[] = []
    await authorizeBot(
      {
        ...apiConfig,
        TWITCH_BOT_REDIRECT_URI: "http://localhost:1234/callback",
      },
      {
        api: new TwitchApi(
          apiConfig,
          httpFake((url) =>
            json(url.pathname.endsWith("token") ? botToken : validBot)
          )
        ),
        store,
        showUrl: (url) => urls.push(url),
        waitForCode: async (_redirect, state, show) => {
          assert.equal(state.length, 64)
          show()
          return "test-only-code"
        },
      }
    )
    assert.equal((await store.read()).botUserId, "111")
    assert.equal(
      urls.some(
        (url) =>
          url.includes("test-only-access") ||
          url.includes("test-only-refresh") ||
          url.includes("test-only-secret")
      ),
      false
    )
  })
  await withGrant(async (store) => {
    await assert.rejects(
      authorizeBot(
        {
          ...apiConfig,
          TWITCH_BOT_REDIRECT_URI: "http://localhost:1234/callback",
        },
        {
          api: new TwitchApi(
            apiConfig,
            httpFake((url) =>
              json(
                url.pathname.endsWith("token")
                  ? botToken
                  : { ...validBot, user_id: "222" }
              )
            )
          ),
          store,
          showUrl: () => undefined,
          waitForCode: async () => "test-only-code",
        }
      ),
      /wrongBot/
    )
    await assert.rejects(store.read())
  })
})
