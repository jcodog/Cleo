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

  const result = await fetchDiscordJson("https://discord.test/resource", request, {
    fetch: async (_url, init) => {
      fetchCalls.push(init ?? {})
      return responses.shift() ?? jsonResponse(500, {})
    },
    sleep: async (delayMs) => {
      delays.push(delayMs)
    },
  })

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

  const result = await fetchDiscordJson("https://discord.test/resource", {}, {
    fetch: async () => responses.shift() ?? jsonResponse(500, {}),
    sleep: async (delayMs) => {
      delays.push(delayMs)
    },
  })

  assert.deepEqual(result, { ok: true, status: 200, json: null })
  assert.deepEqual(delays, [10])
})

test("Discord transport rejects malformed rate-limit metadata", async () => {
  const malformedValues: Array<Response> = [
    jsonResponse(429, { retry_after: "later" }, { "Retry-After": "later" }),
    jsonResponse(429, {}),
    new Response("not-json", { status: 429 }),
    jsonResponse(429, { retry_after: "" }),
    jsonResponse(429, { retry_after: -1 }),
    jsonResponse(429, { retry_after: null }),
  ]

  for (const response of malformedValues) {
    let calls = 0
    const result = await fetchDiscordJson("https://discord.test/resource", {}, {
      fetch: async () => {
        calls += 1
        return response
      },
      sleep: async () => assert.fail("Malformed metadata must not be retried"),
    })
    assert.deepEqual(result, { ok: false, status: 429 })
    assert.equal(calls, 1)
  }
})

test("Discord transport bounds retry attempts and total waiting", async () => {
  const delays: number[] = []
  let exhaustionCalls = 0
  const exhausted = await fetchDiscordJson("https://discord.test/resource", {}, {
    fetch: async () => {
      exhaustionCalls += 1
      return jsonResponse(429, { retry_after: 0 }, { "Retry-After": "0" })
    },
    sleep: async (delayMs) => {
      delays.push(delayMs)
    },
    maxRateLimitRetries: 2,
  })

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
    const result = await fetchDiscordJson("https://discord.test/resource", {}, {
      fetch: async () => {
        calls += 1
        return jsonResponse(status, { message: "denied" })
      },
      sleep: async () => assert.fail(`${status} must not be retried`),
    })
    assert.deepEqual(result, { ok: false, status })
    assert.equal(calls, 1)
  }
})

test("Discord transport cancels unused error response bodies", async () => {
  let cancelled = false
  const body = new ReadableStream({
    cancel() {
      cancelled = true
    },
  })

  const result = await fetchDiscordJson("https://discord.test/resource", {}, {
    fetch: async () => new Response(body, { status: 403 }),
  })

  assert.deepEqual(result, { ok: false, status: 403 })
  assert.equal(cancelled, true)
})

test("Discord transport accepts successful responses without a body", async () => {
  const result = await fetchDiscordJson("https://discord.test/resource", {}, {
    fetch: async () => new Response(null, { status: 204 }),
  })

  assert.deepEqual(result, { ok: true, status: 204 })
})

test("Discord transport handles success and network failure", async () => {
  const success = await fetchDiscordJson("https://discord.test/resource", {}, {
    fetch: async () => jsonResponse(200, { guild: "ready" }),
    requestTimeoutMs: 25,
  })
  assert.deepEqual(success, {
    ok: true,
    status: 200,
    json: { guild: "ready" },
  })

  const failure = await fetchDiscordJson("https://discord.test/resource", {}, {
    fetch: async () => {
      throw new Error("network unavailable with Bot test-secret")
    },
  })
  assert.equal(failure, null)

  const timeout = await fetchDiscordJson(
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
  assert.equal(timeout, null)
})

test("Discord transport uses its production wait boundary", async () => {
  const responses = [
    jsonResponse(429, { retry_after: 0 }),
    jsonResponse(200, { ready: true }),
  ]

  const result = await fetchDiscordJson("https://discord.test/resource", {}, {
    fetch: async () => responses.shift() ?? jsonResponse(500, {}),
  })

  assert.deepEqual(result, {
    ok: true,
    status: 200,
    json: { ready: true },
  })
})

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
