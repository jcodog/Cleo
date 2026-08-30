import assert from "node:assert/strict"
import { test } from "node:test"

import { fetchDiscordJson } from "./discordRestTransport"

const request = { headers: { Authorization: "Bot test-secret" } }

test("Discord transport retries a 429 using Retry-After and succeeds", async () => {
  const responses = [
    jsonResponse(429, { retry_after: 10 }, { "Retry-After": "0.025" }),
    jsonResponse(200, { ok: true }),
  ]
  const delays: number[] = []
  const fetchCalls: RequestInit[] = []

  const result = await fetchDiscordJson(
    "https://discord.test/resource",
    request,
    {
      fetch: async (_url, init) => {
        fetchCalls.push(init ?? {})
        return responses.shift() ?? jsonResponse(500, {})
      },
      sleep: async (delayMs) => {
        delays.push(delayMs)
      },
    }
  )

  assert.deepEqual(result, { ok: true, status: 200, json: { ok: true } })
  assert.deepEqual(delays, [25])
  assert.equal(fetchCalls.length, 2)
  assert.ok(fetchCalls.every((init) => init.signal instanceof AbortSignal))
})

test("Discord transport falls back to JSON retry_after", async () => {
  const responses = [
    jsonResponse(429, { retry_after: 0.01 }),
    jsonResponse(200, null),
  ]
  const delays: number[] = []

  const result = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => responses.shift() ?? jsonResponse(500, {}),
      sleep: async (delayMs) => {
        delays.push(delayMs)
      },
    }
  )

  assert.deepEqual(result, { ok: true, status: 200, json: null })
  assert.deepEqual(delays, [10])
})

test("Discord transport rejects malformed rate-limit metadata", async () => {
  const malformedValues: Array<Response> = [
    jsonResponse(429, { retry_after: "later" }, { "Retry-After": "later" }),
    jsonResponse(429, {}),
    jsonResponse(429, null),
    jsonResponse(429, "not-an-object"),
    new Response("not-json", { status: 429 }),
    jsonResponse(429, { retry_after: "" }),
    jsonResponse(429, { retry_after: -1 }),
    jsonResponse(429, { retry_after: null }),
  ]

  for (const response of malformedValues) {
    let calls = 0
    const result = await fetchDiscordJson(
      "https://discord.test/resource",
      {},
      {
        fetch: async () => {
          calls += 1
          return response
        },
        sleep: async () =>
          assert.fail("Malformed metadata must not be retried"),
      }
    )
    assert.deepEqual(result, { ok: false, status: 429 })
    assert.equal(calls, 1)
  }
})

test("Discord transport bounds retry attempts and total waiting", async () => {
  const delays: number[] = []
  let exhaustionCalls = 0
  const exhausted = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => {
        exhaustionCalls += 1
        return jsonResponse(429, { retry_after: 0 }, { "Retry-After": "0" })
      },
      sleep: async (delayMs) => {
        delays.push(delayMs)
      },
      maxRateLimitRetries: 2,
    }
  )

  assert.deepEqual(exhausted, { ok: false, status: 429 })
  assert.equal(exhaustionCalls, 3)
  assert.deepEqual(delays, [0, 0])

  let budgetCalls = 0
  const overBudget = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => {
        budgetCalls += 1
        return jsonResponse(429, { retry_after: 6 })
      },
      sleep: async () => assert.fail("Over-budget delays must not be awaited"),
      rateLimitWaitBudgetMs: 5_000,
    }
  )
  assert.deepEqual(overBudget, { ok: false, status: 429 })
  assert.equal(budgetCalls, 1)
})

test("Discord transport does not retry authentication or permission failures", async () => {
  for (const status of [401, 403, 404]) {
    let calls = 0
    const result = await fetchDiscordJson(
      "https://discord.test/resource",
      {},
      {
        fetch: async () => {
          calls += 1
          return jsonResponse(status, { message: "denied" })
        },
        sleep: async () => assert.fail(`${status} must not be retried`),
      }
    )
    assert.deepEqual(result, { ok: false, status })
    assert.equal(calls, 1)
  }
})

test("Discord transport keeps explicitly expected error statuses quiet", async () => {
  for (const status of [403, 404]) {
    const { result, logs } = await captureWarnings(() =>
      fetchDiscordJson(
        "https://discord.test/resource",
        {},
        {
          fetch: async () => new Response(null, { status }),
          expectedErrorStatuses: [403, 404],
        }
      )
    )

    assert.deepEqual(result, { ok: false, status })
    assert.deepEqual(logs, [])
  }
})

test("Discord transport records safe request context for supported and unknown auth schemes", async () => {
  const cases: Array<{
    url: string
    init: RequestInit
    expectedMethod: string
    expectedEndpoint: string
    expectedAuthScheme: string
    secret: string
  }> = [
    {
      url: "https://discord.test/api/v10/users/@me/guilds?token=query-secret",
      init: {
        method: "post",
        headers: { Authorization: "Bearer oauth-secret" },
      },
      expectedMethod: "POST",
      expectedEndpoint: "/api/v10/users/@me/guilds",
      expectedAuthScheme: "bearer",
      secret: "oauth-secret",
    },
    {
      url: "https://discord.test/resource",
      init: {
        method: "patch",
        headers: { Authorization: "Basic basic-secret" },
      },
      expectedMethod: "PATCH",
      expectedEndpoint: "/resource",
      expectedAuthScheme: "other",
      secret: "basic-secret",
    },
  ]

  for (const testCase of cases) {
    const { result, logs } = await captureWarnings(() =>
      fetchDiscordJson(testCase.url, testCase.init, {
        fetch: async () => new Response(null, { status: 403 }),
      })
    )

    assert.deepEqual(result, { ok: false, status: 403 })
    assert.equal(logs.length, 1)

    const [log] = logs
    assert.ok(log)
    assert.deepEqual(log, {
      level: "warn",
      namespace: "backend.discord-rest",
      message: "Discord REST request failed.",
      metadata: {
        method: testCase.expectedMethod,
        endpoint: testCase.expectedEndpoint,
        authScheme: testCase.expectedAuthScheme,
        status: 403,
        retries: 0,
        waitedMs: 0,
      },
    })
    assert.equal(JSON.stringify(log).includes(testCase.secret), false)
    assert.equal(JSON.stringify(log).includes("query-secret"), false)
  }
})

test("Discord transport degrades invalid URL and unreadable header log context safely", async () => {
  const malformedHeaders: HeadersInit = [["bad\nheader", "secret-value"]]

  const { result, logs } = await captureWarnings(() =>
    fetchDiscordJson(
      "not a valid Discord URL",
      { headers: malformedHeaders },
      {
        fetch: async () => new Response(null, { status: 403 }),
      }
    )
  )

  assert.deepEqual(result, { ok: false, status: 403 })
  assert.equal(logs.length, 1)

  const [log] = logs
  assert.ok(log)
  assert.deepEqual(log, {
    level: "warn",
    namespace: "backend.discord-rest",
    message: "Discord REST request failed.",
    metadata: {
      method: "GET",
      endpoint: "<invalid-url>",
      authScheme: "unreadable",
      status: 403,
      retries: 0,
      waitedMs: 0,
    },
  })
  assert.equal(JSON.stringify(log).includes("secret-value"), false)
})

test("Discord transport cancels unused error response bodies", async () => {
  let cancelled = false
  const body = new ReadableStream({
    cancel() {
      cancelled = true
    },
  })

  const result = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => new Response(body, { status: 403 }),
    }
  )

  assert.deepEqual(result, { ok: false, status: 403 })
  assert.equal(cancelled, true)
})

test("Discord transport leaves already-consumed error response bodies alone", async () => {
  const response = jsonResponse(403, { message: "denied" })
  await response.text()
  assert.equal(response.bodyUsed, true)

  const result = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => response,
    }
  )

  assert.deepEqual(result, { ok: false, status: 403 })
  assert.equal(response.bodyUsed, true)
})

test("Discord transport preserves errors when body cancellation fails", async () => {
  const cancellationFailure = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              throw new Error("stream cancellation failed")
            },
          }),
          { status: 403 }
        ),
    }
  )

  assert.deepEqual(cancellationFailure, { ok: false, status: 403 })
})

test("Discord transport accepts successful responses without a body", async () => {
  const result = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => new Response(null, { status: 204 }),
    }
  )

  assert.deepEqual(result, { ok: true, status: 204 })
})

test("Discord transport uses the global fetch boundary when no override is provided", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0

  globalThis.fetch = (async (_input, init) => {
    calls += 1
    assert.ok(init?.signal instanceof AbortSignal)
    return jsonResponse(200, { global: true })
  }) as typeof fetch

  try {
    const result = await fetchDiscordJson("https://discord.test/resource", {})

    assert.deepEqual(result, {
      ok: true,
      status: 200,
      json: { global: true },
    })
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Discord transport handles success and network failure", async () => {
  const success = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => jsonResponse(200, { guild: "ready" }),
      requestTimeoutMs: 25,
    }
  )
  assert.deepEqual(success, {
    ok: true,
    status: 200,
    json: { guild: "ready" },
  })

  const failure = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => {
        throw new Error("network unavailable with Bot test-secret")
      },
    }
  )
  assert.equal(failure, null)
})

test("Discord transport logs non-Error transport failures without exposing their value", async () => {
  const { result, logs } = await captureErrors(() =>
    fetchDiscordJson(
      "https://discord.test/resource",
      {
        method: "delete",
        headers: { Authorization: "Bearer oauth-secret" },
      },
      {
        fetch: async () => {
          throw createNonErrorFailure()
        },
      }
    )
  )

  assert.equal(result, null)
  assert.equal(logs.length, 1)

  const [log] = logs
  assert.ok(log)
  assert.deepEqual(log, {
    level: "error",
    namespace: "backend.discord-rest",
    message: "Discord REST request failed before a response.",
    metadata: {
      method: "DELETE",
      endpoint: "/resource",
      authScheme: "bearer",
      errorType: "string",
      retries: 0,
      waitedMs: 0,
    },
  })
  assert.equal(JSON.stringify(log).includes("transport-sensitive-value"), false)
  assert.equal(JSON.stringify(log).includes("oauth-secret"), false)
})

test("Discord transport treats a request timeout as a failure", async () => {
  const result = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        }),
      requestTimeoutMs: 5,
    }
  )

  assert.equal(result, null)
})

test("Discord transport preserves caller cancellation", async () => {
  const controller = new AbortController()
  const result = fetchDiscordJson(
    "https://discord.test/resource",
    { signal: controller.signal },
    {
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        }),
      requestTimeoutMs: 1_000,
    }
  )

  controller.abort()
  assert.equal(await result, null)
})

test("Discord transport uses its production wait boundary", async () => {
  const responses = [
    jsonResponse(429, { retry_after: 0 }),
    jsonResponse(200, { ready: true }),
  ]

  const result = await fetchDiscordJson(
    "https://discord.test/resource",
    {},
    {
      fetch: async () => responses.shift() ?? jsonResponse(500, {}),
    }
  )

  assert.deepEqual(result, {
    ok: true,
    status: 200,
    json: { ready: true },
  })
})

type CapturedLog = {
  level: string
  namespace: string
  message: string
  metadata?: Record<string, unknown>
}

async function captureWarnings<T>(run: () => Promise<T>) {
  const originalWarn = console.warn
  const lines: string[] = []

  console.warn = (...data: unknown[]) => {
    lines.push(data.map(String).join(" "))
  }

  try {
    return {
      result: await run(),
      logs: lines.map(parseCapturedLog),
    }
  } finally {
    console.warn = originalWarn
  }
}

async function captureErrors<T>(run: () => Promise<T>) {
  const originalError = console.error
  const lines: string[] = []

  console.error = (...data: unknown[]) => {
    lines.push(data.map(String).join(" "))
  }

  try {
    return {
      result: await run(),
      logs: lines.map(parseCapturedLog),
    }
  } finally {
    console.error = originalError
  }
}

function parseCapturedLog(line: string): CapturedLog {
  return JSON.parse(line) as CapturedLog
}

function createNonErrorFailure(): unknown {
  return "transport-sensitive-value"
}

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}
