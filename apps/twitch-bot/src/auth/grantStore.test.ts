import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { createLogger } from "@workspace/logger"
import {
  apiConfig,
  botToken,
  httpFake,
  json,
  validBot,
  withGrant,
} from "../../tests/fixtures"
import { TwitchApiService, TwitchFailure } from "../services/TwitchApiService"
import { createGrant, ensureBotGrant, GrantStore } from "./grantStore"

test("rotated grant survives primary persistence failure and a new store recovers it without refreshing the old token", async (t) => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    t.mock.method(store, "write", async () => {
      throw new Error("primary persistence unavailable")
    })
    let refreshes = 0
    const api = new TwitchApiService(
      apiConfig,
      httpFake((url, init) => {
        if (url.pathname.endsWith("token")) {
          refreshes++
          return json({
            ...botToken,
            access_token: "test-only-new",
            refresh_token: "test-only-rotated",
          })
        }
        return new Headers(init.headers).get("Authorization") ===
          "OAuth test-only-access"
          ? json({}, 401)
          : json(validBot)
      })
    )
    await assert.rejects(ensureBotGrant(api, store, apiConfig))
    const recovered = new GrantStore(store.path)
    assert.equal((await recovered.read()).refreshToken, "test-only-rotated")
    await ensureBotGrant(api, recovered, apiConfig)
    assert.equal(refreshes, 1)
  })
})

test("private grant writes are atomic, readable and initial bootstrap never overwrites", async () => {
  await withGrant(async (store) => {
    const grant = createGrant(botToken, apiConfig)
    await store.write(grant, false)
    assert.deepEqual(await store.read(), grant)
    await assert.rejects(
      store.write({ ...grant, refreshToken: "test-only-new" }, false)
    )
    assert.equal((await store.read()).refreshToken, "test-only-refresh")
    await store.write({ ...grant, refreshToken: "test-only-new" })
    assert.equal((await store.read()).refreshToken, "test-only-new")
    await writeFile(store.path, "malformed", { mode: 0o600 })
    await assert.rejects(store.read(), /valid private/)
    await writeFile(store.path, JSON.stringify({ version: 2 }), { mode: 0o600 })
    await assert.rejects(store.read(), /valid private/)
  })
})

test("grant storage rejects directory targets, oversized files and symlinked output directories", async () => {
  await withGrant(async (store, directory) => {
    await writeFile(store.path, "x".repeat(16385), { mode: 0o600 })
    await assert.rejects(store.read())
    const folder = join(directory, "folder")
    await mkdir(folder, { mode: 0o700 })
    await assert.rejects(new GrantStore(folder).read())
    const link = join(directory, "linked")
    await symlink(folder, link, "junction")
    await assert.rejects(
      new GrantStore(join(link, "grant.json")).write(
        createGrant(botToken, apiConfig)
      ),
      /must be private/
    )
  })
})

test("grant lock serializes refresh operations, times out safely and cleans up after failure", async () => {
  await withGrant(async (store) => {
    const events: number[] = []
    let notifyAcquired: () => void = () => undefined
    const acquired = new Promise<void>((resolve) => {
      notifyAcquired = resolve
    })
    const first = store.locked(async () => {
      events.push(1)
      notifyAcquired()
      await new Promise((resolve) => setTimeout(resolve, 60))
      events.push(2)
    })
    await acquired
    await Promise.all([
      first,
      store.locked(async () => {
        events.push(3)
      }),
    ])
    assert.deepEqual(events, [1, 2, 3])
    await writeFile(`${store.path}.lock`, "test-only-lock", { mode: 0o600 })
    await assert.rejects(
      new GrantStore(store.path, 1).locked(async () => undefined),
      /locked/
    )
  })
  await withGrant(async (store) => {
    await assert.rejects(
      store.locked(async () => {
        throw new Error("test-only-operation-failure")
      }),
      /operation-failure/
    )
    assert.equal(await store.locked(async () => true), true)
  })
  await assert.rejects(
    new GrantStore("/missing-parent/lock-test/grant.json").locked(
      async () => undefined
    ),
    /Cannot acquire/
  )
})

test("valid bot grant is checked; expired/unauthorized credentials refresh once and persist rotation", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let refreshes = 0
    const api = new TwitchApiService(
      apiConfig,
      httpFake((url, init) => {
        if (url.pathname.endsWith("token")) {
          refreshes++
          return json({
            ...botToken,
            access_token: "test-only-new-access",
            refresh_token: "test-only-rotated",
          })
        }
        return new Headers(init.headers).get("Authorization") ===
          "OAuth test-only-access"
          ? json({}, 401)
          : json(validBot)
      })
    )
    await ensureBotGrant(api, store, apiConfig)
    assert.equal(refreshes, 1)
    assert.equal((await store.read()).refreshToken, "test-only-rotated")
    await ensureBotGrant(api, store, apiConfig)
    assert.equal(refreshes, 1)
  })
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let calls = 0
    await ensureBotGrant(
      new TwitchApiService(
        apiConfig,
        httpFake((url) => {
          calls++
          return json(
            url.pathname.endsWith("token")
              ? botToken
              : { ...validBot, expires_in: calls === 1 ? 0 : 100 }
          )
        })
      ),
      store,
      apiConfig
    )
    assert.equal(calls, 3)
  })
})

test("grant identity, permission, refresh failures and unavailable validation never become authorized", async () => {
  for (const [patch, code] of [
    [{ clientId: "other" }, "wrongClient"],
    [{ botUserId: "222" }, "wrongBot"],
  ] as const) {
    await withGrant(async (store) => {
      await store.write({ ...createGrant(botToken, apiConfig), ...patch })
      await assert.rejects(
        ensureBotGrant(
          new TwitchApiService(
            apiConfig,
            httpFake(() => {
              throw new Error("must not fetch")
            })
          ),
          store,
          apiConfig
        ),
        (error: unknown) =>
          error instanceof TwitchFailure && error.code === code
      )
    })
  }
  for (const status of [401, 500])
    await withGrant(async (store) => {
      await store.write(createGrant(botToken, apiConfig))
      let refreshes = 0
      const api = new TwitchApiService(
        apiConfig,
        httpFake((url) => {
          if (url.pathname.endsWith("token")) refreshes++
          return json({}, status)
        })
      )
      await assert.rejects(ensureBotGrant(api, store, apiConfig))
      assert.equal(refreshes, status === 401 ? 1 : 0)
    })
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    await assert.rejects(
      ensureBotGrant(
        new TwitchApiService(
          apiConfig,
          httpFake(() => json({ ...validBot, scopes: [] }))
        ),
        store,
        apiConfig
      ),
      (error: unknown) =>
        error instanceof TwitchFailure && error.code === "missingScope"
    )
  })
})

test("shared structured logger redacts test credentials without exposing grant contents", () => {
  const original = console.log
  const lines: string[] = []
  console.log = (value: string) => lines.push(value)
  try {
    createLogger("twitch-test").info("grant diagnostic", {
      accessToken: "test-only-access",
      refreshToken: "test-only-refresh",
      clientSecret: "test-only-secret",
    })
  } finally {
    console.log = original
  }
  assert.equal(
    lines.some((line) =>
      /test-only-access|test-only-refresh|test-only-secret/.test(line)
    ),
    false
  )
  assert.match(lines.join(""), /redacted/)
})

test("rotated credential survives a subsequent validate outage", async () => {
  await withGrant(async (store) => {
    await store.write(createGrant(botToken, apiConfig))
    let validations = 0
    const api = new TwitchApiService(
      apiConfig,
      httpFake((url) => {
        if (url.pathname.endsWith("token"))
          return json({ ...botToken, refresh_token: "test-only-rotated" })
        validations++
        return json({}, validations === 1 ? 401 : 503)
      })
    )
    await assert.rejects(ensureBotGrant(api, store, apiConfig))
    assert.equal(
      JSON.parse(await readFile(store.path, "utf8")).refreshToken,
      "test-only-rotated"
    )
  })
})
