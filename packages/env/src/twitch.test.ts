import assert from "node:assert/strict"
import { test } from "node:test"
import {
  resolveTwitchCredentials,
  resolveTwitchOperatorEnv,
  resolveTwitchRuntimeEnv,
} from "./twitch"

const credentials = {
  TWITCH_CLIENT_ID: "test-client",
  TWITCH_CLIENT_SECRET: "test-only-client-secret",
  TWITCH_BOT_USER_ID: "111",
  TWITCH_BOT_GRANT_PATH: "/private/bot.twitch-grant.json",
}
const runtime = {
  ...credentials,
  TWITCH_BOOTSTRAP_BROADCASTER_USER_ID: "222",
  TWITCH_EVENTSUB_CALLBACK_URL: "https://test.convex.site/twitch-eventsub",
  TWITCH_EVENTSUB_SECRET: "test-only-eventsub-secret",
  TWITCH_READINESS_PATH: "/private/bot.twitch-readiness.json",
}

test("Twitch environment keeps credentials scoped and supplies bounded defaults", () => {
  for (const value of [undefined, "", "   ", "runtime-secret"])
    assert.equal(
      resolveTwitchRuntimeEnv({
        ...runtime,
        TWITCH_RUNTIME_CONVEX_SECRET: value,
      }).TWITCH_RUNTIME_CONVEX_SECRET,
      value?.trim() || undefined
    )
  const parsed = resolveTwitchCredentials({
    ...credentials,
    NODE_ENV: "production",
    TWITCH_EVENTSUB_SECRET: "unused",
  })
  assert.equal(parsed.TWITCH_HTTP_TIMEOUT_MS, 10000)
  assert.equal("TWITCH_EVENTSUB_SECRET" in parsed, false)
  assert.equal(
    resolveTwitchRuntimeEnv(runtime).TWITCH_STARTUP_TIMEOUT_MS,
    90000
  )
  assert.equal(
    resolveTwitchCredentials({
      ...credentials,
      TWITCH_BOT_GRANT_PATH: "C:\\private\\grant",
    }).NODE_ENV,
    "development"
  )
})

test("Twitch config rejects identity confusion, insecure callbacks and invalid secrets without echoing values", () => {
  for (const patch of [
    { TWITCH_CLIENT_SECRET: "" },
    { TWITCH_BOT_GRANT_PATH: "relative.json" },
    { TWITCH_BOT_USER_ID: "0" },
    { TWITCH_BOOTSTRAP_BROADCASTER_USER_ID: "111" },
    { TWITCH_READINESS_PATH: "relative" },
    { TWITCH_HTTP_TIMEOUT_MS: "0" },
    { TWITCH_STARTUP_TIMEOUT_MS: "180001" },
    { TWITCH_EVENTSUB_CALLBACK_URL: "invalid" },
    { TWITCH_EVENTSUB_CALLBACK_URL: "http://127.0.0.1/twitch-eventsub" },
    {
      TWITCH_EVENTSUB_CALLBACK_URL:
        "https://test.convex.site:8443/twitch-eventsub",
    },
    { TWITCH_EVENTSUB_CALLBACK_URL: "https://test.convex.site/wrong" },
    {
      TWITCH_EVENTSUB_CALLBACK_URL:
        "https://user:password@test.convex.site/twitch-eventsub",
    },
    {
      TWITCH_EVENTSUB_CALLBACK_URL:
        "https://test.convex.site/twitch-eventsub?query=1",
    },
    {
      TWITCH_EVENTSUB_CALLBACK_URL:
        "https://test.convex.site/twitch-eventsub#fragment",
    },
    { TWITCH_EVENTSUB_SECRET: "short" },
    { TWITCH_EVENTSUB_SECRET: "secret with spaces" },
  ])
    assert.throws(
      () => resolveTwitchRuntimeEnv({ ...runtime, ...patch }),
      /Invalid Twitch environment/
    )
  assert.throws(
    () =>
      resolveTwitchRuntimeEnv({
        ...runtime,
        TWITCH_EVENTSUB_SECRET: "a\nsecret",
      }),
    (error: unknown) =>
      error instanceof Error && !error.message.includes("a\nsecret")
  )
})

test("operator redirects require explicit localhost HTTP and are separate from EventSub", () => {
  assert.equal(
    resolveTwitchOperatorEnv({
      ...credentials,
      TWITCH_BOT_REDIRECT_URI: "http://localhost:8765/callback",
    }).TWITCH_BOT_REDIRECT_URI,
    "http://localhost:8765/callback"
  )
  for (const uri of [
    undefined,
    "bad",
    "https://example.com/callback",
    "https://localhost:1234/callback",
    "http://example.com:1234/callback",
    "http://localhost/callback",
    "http://localhost:1234/other",
    "http://127.0.0.1:1234/callback",
    "http://user:password@localhost:1234/callback",
    "http://localhost:1234/callback?a=1",
    "http://localhost:1234/callback#hash",
  ]) {
    assert.throws(() =>
      resolveTwitchOperatorEnv({ ...credentials, TWITCH_BOT_REDIRECT_URI: uri })
    )
  }
})
