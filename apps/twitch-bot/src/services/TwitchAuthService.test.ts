import assert from "node:assert/strict"
import { test } from "node:test"
import { createGrant } from "../auth/grantStore"
import { TwitchApiService } from "./TwitchApiService"
import { TwitchAuthService } from "./TwitchAuthService"
import {
  withGrant,
  apiConfig,
  botToken,
  runtimeEnv,
  validBot,
  validApp,
  httpFake,
  json,
} from "../../tests/fixtures"
test("auth keeps a validated app token, refreshes expired authorization and does not hide provider outages", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let appStatus = 200
    let expiry = 1000
    let malformed = false
    let tokens = 0
    const api = new TwitchApiService(
      apiConfig,
      httpFake((url, init) => {
        if (url.pathname.endsWith("token")) {
          tokens++
          appStatus = 200
          expiry = 1000
          return json({
            access_token: `app-${tokens}`,
            token_type: "bearer",
            expires_in: 1000,
          })
        }
        if (
          new Headers(init.headers).get("Authorization") ===
          "OAuth test-only-access"
        )
          return json(validBot)
        return json(
          malformed
            ? { ...validApp, client_id: "wrong" }
            : { ...validApp, expires_in: expiry },
          appStatus
        )
      })
    )
    const auth = new TwitchAuthService(api, store, runtimeEnv(store.path))
    assert.equal(await auth.appToken(), "app-1")
    assert.equal(await auth.appToken(), "app-1")
    assert.equal(await auth.maintain(), "app-1")
    appStatus = 401
    assert.equal(await auth.maintain(), "app-2")
    appStatus = 200
    expiry = 0
    assert.equal(await auth.maintain(), "app-3")
    expiry = 1000
    appStatus = 503
    await assert.rejects(auth.maintain(), /apiUnavailable/)
    appStatus = 200
    malformed = true
    await assert.rejects(auth.maintain(), /wrongClient/)
    assert.equal(tokens, 3)
  })
})

test("concurrent maintenance shares one token acquisition and retries after a failed flight", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let tokens = 0
    let fail = true
    const api = new TwitchApiService(
      apiConfig,
      httpFake((url, init) => {
        if (url.pathname.endsWith("token")) {
          tokens++
          return fail
            ? json({}, 503)
            : json({
                access_token: "app",
                token_type: "bearer",
                expires_in: 1000,
              })
        }
        return json(
          new Headers(init.headers).get("Authorization") === "OAuth app"
            ? validApp
            : validBot
        )
      })
    )
    const auth = new TwitchAuthService(api, store, runtimeEnv(store.path))
    const first = await Promise.allSettled([
      auth.maintain(),
      auth.maintain(),
      auth.appToken(),
    ])
    assert.ok(first.every((result) => result.status === "rejected"))
    assert.equal(tokens, 1)
    fail = false
    assert.deepEqual(
      await Promise.all([auth.maintain(), auth.maintain(), auth.appToken()]),
      ["app", "app", "app"]
    )
    assert.equal(tokens, 2)
  })
})
