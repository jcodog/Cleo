import assert from "node:assert/strict"
import { test } from "node:test"

import { TwitchApi } from "./api"
import {
  apiConfig,
  botToken,
  httpFake,
  json,
  subscription,
  withGrant,
  silentLogger,
  runtimeEnv,
  runtimeHttp,
} from "../tests/fixtures"
import { createGrant } from "./grantStore"
import type { ReadinessState } from "./readiness"
import { runRuntime } from "./runtime"

test("configured live sources reconcile dynamically and failures do not stop bootstrap chat health", async (t) => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    const config = {
      ...runtimeEnv(store.path),
      TWITCH_RUNTIME_CONVEX_SECRET: "test-live-secret",
    }
    const abort = new AbortController()
    let calls = 0
    const logs: string[] = []
    t.mock.method(
      globalThis,
      "fetch",
      httpFake(() => {
        if (++calls === 2) throw new Error("live sources offline")
        return json({ broadcasterIds: ["333"] })
      })
    )
    let sleeps = 0
    await runRuntime(config, {
      store,
      createApi: (signal) => new TwitchApi(apiConfig, runtimeHttp(), signal),
      signal: abort.signal,
      logger: {
        ...silentLogger,
        error: (message) => {
          logs.push(message)
        },
      },
      writeState: async () => undefined,
      sleep: async () => {
        if (++sleeps === 3) abort.abort()
      },
    })
    assert.equal(calls, 3)
    assert.deepEqual(logs, ["Twitch live subscription reconciliation failed"])
  })
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    const abort = new AbortController()
    await runRuntime(
      {
        ...runtimeEnv(store.path),
        TWITCH_RUNTIME_CONVEX_SECRET: "test-live-secret",
      },
      {
        store,
        createApi: (signal) => new TwitchApi(apiConfig, runtimeHttp(), signal),
        signal: abort.signal,
        logger: silentLogger,
        writeState: async () => undefined,
        loadLive: async () => ["444"],
        reconcileLive: async (_api, _token, ids) => {
          assert.deepEqual(ids, ["444"])
          return []
        },
        sleep: async () => {
          abort.abort()
        },
      }
    )
  })
})

test("failed unhealthy persistence preserves the original failure and logs sanitized diagnostics", async () => {
  await withGrant(async (store) => {
    const original = new Error("state failed token=test-only-private")
    const logged: unknown[] = []
    let writes = 0
    await assert.rejects(
      runRuntime(runtimeEnv(store.path), {
        store,
        createApi: (signal) => new TwitchApi(apiConfig, runtimeHttp(), signal),
        signal: new AbortController().signal,
        logger: {
          ...silentLogger,
          error: (_message, metadata) => {
            logged.push(metadata)
          },
        },
        writeState: async () => {
          if (++writes === 1) throw original
          throw new Error("unhealthy write failed")
        },
      }),
      (error) => error === original
    )
    assert.match(JSON.stringify(logged), /state failed/)
    assert.match(JSON.stringify(logged), /unhealthy write failed/)
    assert.equal(JSON.stringify(logged).includes("test-only-private"), false)
  })
})

test("valid startup and periodic checks become ready, clean shutdown stops, and chat never sends", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    const states: ReadinessState[] = []
    const abort = new AbortController()
    let sleeps = 0
    let sends = 0
    await runRuntime(runtimeEnv(store.path), {
      store,
      createApi: (signal) =>
        new TwitchApi(
          apiConfig,
          runtimeHttp({ onSend: () => sends++ }),
          signal
        ),
      logger: silentLogger,
      signal: abort.signal,
      writeState: async (_path, state) => {
        states.push(state)
      },
      sleep: async (milliseconds) => {
        assert.equal(milliseconds, 30000)
        if (++sleeps === 2) abort.abort()
      },
    })
    assert.deepEqual(
      states.map((state) => state.state),
      ["starting", "ready", "ready", "stopped"]
    )
    assert.equal(states[1]?.subscriptionId, "test-sub")
    assert.equal(sends, 0)
  })
})

test("bad bot grant, nonexistent broadcaster and EventSub outages prevent readiness", async () => {
  for (const options of [
    { botStatus: 401 },
    { broadcaster: false },
    { listStatus: 503 },
  ])
    await withGrant(async (store) => {
      await store.write(createGrant(botToken, apiConfig))
      const states: string[] = []
      await assert.rejects(
        runRuntime(runtimeEnv(store.path), {
          store,
          createApi: (signal) =>
            new TwitchApi(apiConfig, runtimeHttp(options), signal),
          logger: silentLogger,
          signal: new AbortController().signal,
          writeState: async (_path, state) => {
            states.push(state.state)
          },
          sleep: async () => {
            throw new Error("must not sleep")
          },
        })
      )
      assert.deepEqual(states, ["starting", "unhealthy"])
    })
})

test("missing subscription is created and readiness waits for verification", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let created = false
    const abort = new AbortController()
    const states: string[] = []
    const base = runtimeHttp()
    const http = httpFake((url, init) => {
      if (url.pathname.endsWith("subscriptions")) {
        if (init.method === "POST") {
          created = true
          return json(
            {
              data: [
                {
                  ...subscription,
                  status: "webhook_callback_verification_pending",
                },
              ],
            },
            202
          )
        }
        return json({ data: created ? [subscription] : [] })
      }
      return base(url.href, init)
    })
    await runRuntime(runtimeEnv(store.path), {
      store,
      createApi: (signal) => new TwitchApi(apiConfig, http, signal),
      logger: silentLogger,
      signal: abort.signal,
      writeState: async (_path, state) => {
        states.push(state.state)
      },
      sleep: async (milliseconds) => {
        if (milliseconds === 30000) abort.abort()
      },
    })
    assert.deepEqual(states, ["starting", "starting", "ready", "stopped"])
  })
})

test("verification deadline and lost healthy subscription fail explicitly", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let now = 0
    await assert.rejects(
      runRuntime(runtimeEnv(store.path), {
        store,
        createApi: (signal) =>
          new TwitchApi(
            apiConfig,
            runtimeHttp({
              subscriptions: [
                {
                  ...subscription,
                  status: "webhook_callback_verification_pending",
                },
              ],
            }),
            signal
          ),
        logger: silentLogger,
        signal: new AbortController().signal,
        writeState: async () => undefined,
        sleep: async () => {
          now = 1001
        },
        now: () => now,
      }),
      /startupTimeout/
    )
  })
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let lists = 0
    const base = runtimeHttp()
    const http = httpFake((url, init) =>
      url.pathname.endsWith("subscriptions")
        ? json({
            data: [
              {
                ...subscription,
                status:
                  ++lists === 1
                    ? "enabled"
                    : "webhook_callback_verification_pending",
              },
            ],
          })
        : base(url.href, init)
    )
    await assert.rejects(
      runRuntime(runtimeEnv(store.path), {
        store,
        createApi: (signal) => new TwitchApi(apiConfig, http, signal),
        logger: silentLogger,
        signal: new AbortController().signal,
        writeState: async () => undefined,
        sleep: async () => undefined,
      }),
      /subscriptionUnavailable/
    )
  })
})

test("invalid app tokens are reacquired; other validation failures prevent continuing", async () => {
  for (const failure of [401, 200, 500])
    await withGrant(async (store) => {
      await store.write(createGrant(botToken, apiConfig))
      const abort = new AbortController()
      let appChecks = 0
      let sleeps = 0
      const base = runtimeHttp()
      const http = httpFake((url, init) => {
        if (
          url.pathname.endsWith("validate") &&
          new Headers(init.headers).get("Authorization") ===
            "OAuth test-only-app"
        ) {
          if (++appChecks === 2)
            return json(
              { client_id: "test-client", scopes: [], expires_in: 0 },
              failure
            )
        }
        return base(url.href, init)
      })
      const operation = runRuntime(runtimeEnv(store.path), {
        store,
        createApi: (signal) => new TwitchApi(apiConfig, http, signal),
        logger: silentLogger,
        signal: abort.signal,
        writeState: async () => undefined,
        sleep: async () => {
          if (++sleeps === 2) abort.abort()
        },
      })
      if (failure === 500) await assert.rejects(operation, /apiUnavailable/)
      else {
        await operation
        assert.equal(appChecks, 3)
      }
    })
})

test("startup deadline aborts a stalled Twitch request and writes unhealthy state", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    const states: string[] = []
    const config = { ...runtimeEnv(store.path), TWITCH_STARTUP_TIMEOUT_MS: 20 }
    const stalled = httpFake(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          if (init.signal?.aborted) {
            reject(new Error("aborted"))
            return
          }
          init.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          )
        })
    )
    await assert.rejects(
      runRuntime(config, {
        store,
        createApi: (signal) => new TwitchApi(apiConfig, stalled, signal),
        logger: silentLogger,
        signal: new AbortController().signal,
        writeState: async (_path, state) => {
          states.push(state.state)
        },
      }),
      /startupTimeout/
    )
    assert.deepEqual(states, ["starting", "unhealthy"])
  })
})

test("local state failures are sanitized and cannot become ready", async () => {
  await withGrant(async (store) => {
    let writes = 0
    const logged: unknown[] = []
    await assert.rejects(
      runRuntime(runtimeEnv(store.path), {
        store,
        createApi: (signal) => new TwitchApi(apiConfig, runtimeHttp(), signal),
        signal: new AbortController().signal,
        logger: {
          ...silentLogger,
          error: (_message, metadata) => {
            logged.push(metadata)
          },
        },
        writeState: async () => {
          if (++writes === 1) throw new Error("test-only-private-path")
        },
      })
    )
    assert.equal(logged.length, 1)
    assert.match(JSON.stringify(logged), /localStateUnavailable/)
    assert.match(JSON.stringify(logged), /test-only-private-path/)
  })
})
