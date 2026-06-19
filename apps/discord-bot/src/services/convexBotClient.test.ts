import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assertConvexBotRuntimeConfig,
  createConvexDiagnosticFetch,
  ConvexHttpRequestError,
  resolveConvexBotRuntimeConfig,
  validateConvexUrl,
} from "./convexBotClient"

test("Convex URL validation requires HTTPS for non-loopback hosts", () => {
  assert.equal(
    validateConvexUrl("https://example.convex.cloud", "production"),
    "https://example.convex.cloud"
  )
  assert.equal(
    validateConvexUrl("https://example.convex.cloud/", "production"),
    "https://example.convex.cloud"
  )

  assert.throws(
    () => validateConvexUrl("http://example.com", "development"),
    /must use https/
  )
})

test("Convex URL validation permits loopback HTTP outside production only", () => {
  assert.equal(
    validateConvexUrl("http://localhost:3210", "development"),
    "http://localhost:3210"
  )
  assert.equal(
    validateConvexUrl("http://127.0.0.1:3210", "test"),
    "http://127.0.0.1:3210"
  )
  assert.equal(
    validateConvexUrl("http://[::1]:3210", "development"),
    "http://[::1]:3210"
  )

  assert.throws(
    () => validateConvexUrl("http://localhost:3210", "production"),
    /must use https/
  )
})

test("Convex URL validation rejects invalid URLs and credentials", () => {
  assert.throws(() => validateConvexUrl("not-a-url"), /valid URL/)
  assert.throws(
    () => validateConvexUrl("https://user:pass@example.convex.cloud"),
    /must not include credentials/
  )
  assert.throws(
    () => validateConvexUrl("https://example.convex.cloud/api/action"),
    /without a path/
  )
  assert.throws(
    () => validateConvexUrl("https://example.convex.cloud?token=secret"),
    /without a path/
  )
  assert.throws(
    () => validateConvexUrl("https://example.convex.cloud#fragment"),
    /without a path/
  )
})

test("Convex runtime config resolution is deterministic", () => {
  assert.deepEqual(
    resolveConvexBotRuntimeConfig({
      convexUrl: undefined,
      convexSecret: undefined,
      nodeEnv: "development",
    }),
    {
      status: "disabled",
      missingConfig: ["CONVEX_URL", "DISCORD_BOT_CONVEX_SECRET"],
    }
  )

  assert.deepEqual(
    resolveConvexBotRuntimeConfig({
      convexUrl: "https://example.convex.cloud",
      convexSecret: "secret",
      nodeEnv: "production",
    }),
    {
      status: "ready",
      convexUrl: "https://example.convex.cloud",
      convexSecret: "secret",
    }
  )

  assert.equal(
    resolveConvexBotRuntimeConfig({
      convexUrl: "http://example.com",
      convexSecret: "secret",
      nodeEnv: "development",
    }).status,
    "invalid"
  )
})

test("production runtime config fails startup when Convex credentials are missing", () => {
  assert.throws(
    () =>
      assertConvexBotRuntimeConfig({
        convexUrl: undefined,
        convexSecret: undefined,
        nodeEnv: "production",
      }),
    /Missing production Discord bot runtime config/
  )

  assert.doesNotThrow(() =>
    assertConvexBotRuntimeConfig({
      convexUrl: undefined,
      convexSecret: undefined,
      nodeEnv: "development",
    })
  )
})

test("Convex diagnostic fetch exposes non-UDF HTTP failures", async () => {
  const diagnosticFetch = createConvexDiagnosticFetch(async () => {
    return new Response(
      JSON.stringify({
        email: "user@example.com",
        token: "secret-token",
        cookie: "session=secret-cookie",
        userData: "private profile content",
      }),
      {
        status: 404,
        statusText: "Not Found",
      }
    )
  })

  await assert.rejects(
    async () =>
      await diagnosticFetch("https://example.convex.cloud/api/action", {
        method: "POST",
      }),
    (error) =>
      error instanceof ConvexHttpRequestError &&
      /POST https:\/\/example\.convex\.cloud\/api\/action returned 404 Not Found/.test(
        error.message
      ) &&
      !/user@example\.com/.test(error.message) &&
      !/secret-token/.test(error.message) &&
      !/secret-cookie/.test(error.message) &&
      !/private profile content/.test(error.message)
  )
})

test("Convex diagnostic fetch preserves UDF failure responses for Convex", async () => {
  const udfResponse = new Response(
    JSON.stringify({
      status: "error",
      errorMessage: "function failed",
    }),
    {
      status: 560,
      statusText: "UDF Failed",
    }
  )
  const diagnosticFetch = createConvexDiagnosticFetch(async () => udfResponse)

  assert.equal(
    await diagnosticFetch("https://example.convex.cloud/api/action", {
      method: "POST",
    }),
    udfResponse
  )
})
