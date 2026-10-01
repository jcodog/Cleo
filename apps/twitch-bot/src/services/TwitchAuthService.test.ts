import assert from "node:assert/strict"
import { test } from "node:test"
import { createGrant } from "../auth/grantStore"
import { TwitchApiService } from "./TwitchApiService"
import { TwitchAuthService } from "./TwitchAuthService"
import { AnnouncementService } from "./announcements/AnnouncementService"
import {
  withGrant,
  apiConfig,
  botToken,
  runtimeEnv,
  validBot,
  validApp,
  httpFake,
  json,
  silentLogger,
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

test("chat uses the validated/refreshed persisted bot grant while app-only callers retain the app token", async () => {
  for (const expired of [false, true])
    await withGrant(async (store) => {
      const grant = createGrant(botToken, apiConfig)
      await store.write({
        ...grant,
        expiresAt: expired ? Date.now() - 1 : grant.expiresAt,
      })
      let refreshed = false
      let sends = 0
      let appRequests = 0
      const api = new TwitchApiService(
        apiConfig,
        httpFake((url, init) => {
          const authorization = new Headers(init.headers).get("Authorization")
          if (url.pathname.endsWith("token")) {
            const form = new URLSearchParams(String(init.body))
            if (form.get("grant_type") === "refresh_token") {
              assert.equal(form.get("refresh_token"), botToken.refresh_token)
              refreshed = true
              return json({
                ...botToken,
                access_token: "refreshed-bot",
                refresh_token: "rotated-refresh",
              })
            }
            assert.equal(form.get("grant_type"), "client_credentials")
            appRequests++
            return json({
              access_token: "app-only-token",
              expires_in: 1000,
              token_type: "bearer",
            })
          }
          if (url.pathname.endsWith("validate")) {
            if (authorization === "OAuth app-only-token") return json(validApp)
            if (authorization === `OAuth ${botToken.access_token}`)
              return json({ ...validBot, expires_in: expired ? 0 : 1000 })
            assert.equal(authorization, "OAuth refreshed-bot")
            return json(validBot)
          }
          if (url.pathname.endsWith("users")) {
            assert.equal(authorization, "Bearer app-only-token")
            return json({ data: [{ id: "222" }] })
          }
          assert.equal(url.pathname, "/helix/chat/messages")
          assert.equal(
            authorization,
            `Bearer ${expired ? "refreshed-bot" : botToken.access_token}`
          )
          assert.deepEqual(JSON.parse(String(init.body)), {
            broadcaster_id: "222",
            sender_id: "111",
            message: "Hello Viewer",
          })
          assert.equal(appRequests, 0)
          sends++
          return json({ data: [{ message_id: "message", is_sent: true }] })
        })
      )
      const auth = new TwitchAuthService(api, store, runtimeEnv(store.path))
      await new AnnouncementService(api, auth, silentLogger).send(
        "222",
        { defaultTemplate: "Hello {user}", allowedTemplateTags: ["user"] },
        { user: "Viewer" }
      )
      assert.equal(sends, 1)
      assert.equal(refreshed, expired)
      assert.equal(
        (await store.read()).accessToken,
        expired ? "refreshed-bot" : botToken.access_token
      )
      if (expired)
        assert.equal((await store.read()).refreshToken, "rotated-refresh")
      assert.equal(await auth.appToken(), "app-only-token")
      await api.broadcasterExists(await auth.appToken(), "222")
      assert.equal(appRequests, 1)
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
