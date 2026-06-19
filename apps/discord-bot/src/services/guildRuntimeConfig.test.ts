import assert from "node:assert/strict"
import { test } from "node:test"

import type { DiscordGuildRuntimeConfig } from "./guildRuntimeConfig"
import {
  DiscordGuildRuntimeConfigCache,
  validateDiscordGuildRuntimeConfigBackendResult,
} from "./guildRuntimeConfig"

const guildId = "123456789012345678"
const otherGuildId = "234567890123456789"

const validConfig: DiscordGuildRuntimeConfig = {
  discordGuildId: guildId,
  moderationEnabled: false,
  welcomeEnabled: true,
  loggingEnabled: true,
  logLevel: "medium",
  logChannelId: "345678901234567890",
  modLogChannelId: "456789012345678901",
  welcomeChannelId: "567890123456789012",
  updatesChannelId: "678901234567890123",
  announcementChannelId: "789012345678901234",
}

test("runtime config validation rejects invalid guild IDs", () => {
  const errors: string[] = []

  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: "not-a-guild-id",
      backendResult: {
        status: "ready",
        config: validConfig,
      },
      onError(message) {
        errors.push(message)
      },
    }),
    {
      status: "disabled",
      reason: "invalidGuildId",
    }
  )

  assert.deepEqual(errors, [
    "Invalid Discord guild ID for runtime config fetch.",
  ])
})

test("runtime config validation maps missing backend responses to disabled config", () => {
  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: null,
    }),
    {
      status: "disabled",
      reason: "convexUnavailable",
    }
  )
})

test("runtime config validation preserves backend disabled reasons", () => {
  for (const reason of ["unknownGuild", "botLeft", "missingConfig"] as const) {
    assert.deepEqual(
      validateDiscordGuildRuntimeConfigBackendResult({
        discordGuildId: guildId,
        backendResult: {
          status: "disabled",
          reason,
        },
      }),
      {
        status: "disabled",
        reason,
      }
    )
  }
})

test("runtime config validation rejects malformed backend results", () => {
  const errors: string[] = []

  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: {
        status: "ready",
        config: {
          ...validConfig,
          logChannelId: "bad-channel-id",
        },
      },
      onError(message) {
        errors.push(message)
      },
    }),
    {
      status: "disabled",
      reason: "invalidBackendResponse",
    }
  )

  assert.deepEqual(errors, ["Invalid Convex guild runtime config response."])
})

test("runtime config validation rejects mismatched backend guild IDs", () => {
  const errors: string[] = []

  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: {
        status: "ready",
        config: {
          ...validConfig,
          discordGuildId: otherGuildId,
        },
      },
      onError(message) {
        errors.push(message)
      },
    }),
    {
      status: "disabled",
      reason: "invalidBackendResponse",
    }
  )

  assert.deepEqual(errors, [
    "Invalid Convex guild runtime config response.",
  ])
})

test("runtime config validation accepts valid backend results", () => {
  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: {
        status: "ready",
        config: validConfig,
      },
    }),
    {
      status: "ready",
      config: validConfig,
    }
  )
})

test("runtime config cache miss fetches from backend", async () => {
  let calls = 0
  const cache = createTestCache({
    fetchBackendResult: async () => {
      calls += 1
      return readyBackendResult(validConfig)
    },
  })

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: validConfig,
  })
  assert.equal(calls, 1)
})

test("runtime config cache hit avoids backend fetch", async () => {
  let calls = 0
  const cache = createTestCache({
    fetchBackendResult: async () => {
      calls += 1
      return readyBackendResult(validConfig)
    },
  })

  assert.deepEqual(await cache.get(guildId), await cache.get(guildId))
  assert.equal(calls, 1)
})

test("runtime config cache refreshes expired entries", async () => {
  let now = 0
  let calls = 0
  const refreshedConfig: DiscordGuildRuntimeConfig = {
    ...validConfig,
    welcomeEnabled: false,
  }
  const cache = createTestCache({
    now: () => now,
    readyTtlMs: 10,
    fetchBackendResult: async () => {
      calls += 1
      return readyBackendResult(calls === 1 ? validConfig : refreshedConfig)
    },
  })

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: validConfig,
  })

  now = 11

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: refreshedConfig,
  })
  assert.equal(calls, 2)
})

test("runtime config cache uses short TTL for missing safe-disabled config", async () => {
  let now = 0
  let calls = 0
  const cache = createTestCache({
    now: () => now,
    readyTtlMs: 1_000,
    disabledTtlMs: 10,
    fetchBackendResult: async () => {
      calls += 1
      return calls === 1
        ? disabledBackendResult("missingConfig")
        : readyBackendResult(validConfig)
    },
  })

  assert.deepEqual(await cache.get(guildId), {
    status: "disabled",
    reason: "missingConfig",
  })

  now = 9

  assert.deepEqual(await cache.get(guildId), {
    status: "disabled",
    reason: "missingConfig",
  })
  assert.equal(calls, 1)

  now = 11

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: validConfig,
  })
  assert.equal(calls, 2)
})

test("runtime config cache does not cache malformed responses as valid config", async () => {
  let calls = 0
  const cache = createTestCache({
    onError: () => undefined,
    fetchBackendResult: async () => {
      calls += 1
      return calls === 1
        ? readyBackendResult({
            ...validConfig,
            logChannelId: "bad-channel-id",
          })
        : readyBackendResult(validConfig)
    },
  })

  assert.deepEqual(await cache.get(guildId), {
    status: "disabled",
    reason: "invalidBackendResponse",
  })
  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: validConfig,
  })
  assert.equal(calls, 2)
})

test("runtime config cache concurrent misses share one backend request", async () => {
  let calls = 0
  const backendResult = createDeferred<unknown>()
  const cache = createTestCache({
    fetchBackendResult: async () => {
      calls += 1
      return await backendResult.promise
    },
  })

  const firstFetch = cache.get(guildId)
  const secondFetch = cache.get(guildId)

  assert.equal(calls, 1)

  backendResult.resolve(readyBackendResult(validConfig))

  assert.deepEqual(await firstFetch, {
    status: "ready",
    config: validConfig,
  })
  assert.deepEqual(await secondFetch, {
    status: "ready",
    config: validConfig,
  })
  assert.equal(calls, 1)
})

test("runtime config cache per-guild invalidation forces a fresh fetch", async () => {
  let calls = 0
  const refreshedConfig: DiscordGuildRuntimeConfig = {
    ...validConfig,
    loggingEnabled: false,
  }
  const cache = createTestCache({
    fetchBackendResult: async () => {
      calls += 1
      return readyBackendResult(calls === 1 ? validConfig : refreshedConfig)
    },
  })

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: validConfig,
  })

  cache.invalidate(guildId)

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: refreshedConfig,
  })
  assert.equal(calls, 2)
})

test("runtime config cache full clear forces fresh fetches", async () => {
  const calls = new Map<string, number>()
  const cache = createTestCache({
    fetchBackendResult: async (discordGuildId) => {
      calls.set(discordGuildId, (calls.get(discordGuildId) ?? 0) + 1)
      return readyBackendResult({
        ...validConfig,
        discordGuildId,
      })
    },
  })

  assert.equal((await cache.get(guildId)).status, "ready")
  assert.equal((await cache.get(otherGuildId)).status, "ready")

  cache.clear()

  assert.equal((await cache.get(guildId)).status, "ready")
  assert.equal((await cache.get(otherGuildId)).status, "ready")
  assert.equal(calls.get(guildId), 2)
  assert.equal(calls.get(otherGuildId), 2)
})

test("runtime config cache cleanup removes expired entries and bounds growth", async () => {
  let now = 0
  const expiringCache = createTestCache({
    now: () => now,
    readyTtlMs: 10,
    staleFallbackTtlMs: 0,
    fetchBackendResult: async (discordGuildId) =>
      readyBackendResult({
        ...validConfig,
        discordGuildId,
      }),
  })

  await expiringCache.get(testGuildId(1))
  await expiringCache.get(testGuildId(2))
  assert.equal(expiringCache.size(), 2)

  now = 10
  expiringCache.cleanupExpiredEntries()

  assert.equal(expiringCache.size(), 0)

  const boundedCache = createTestCache({
    now: () => now,
    readyTtlMs: 1_000,
    maxEntries: 2,
    fetchBackendResult: async (discordGuildId) =>
      readyBackendResult({
        ...validConfig,
        discordGuildId,
      }),
  })

  await boundedCache.get(testGuildId(1))
  now = 1
  await boundedCache.get(testGuildId(2))
  now = 2
  await boundedCache.get(testGuildId(3))

  assert.equal(boundedCache.size(), 2)
})

test("runtime config cache refresh failure can return bounded stale valid config", async () => {
  let now = 0
  let calls = 0
  const cache = createTestCache({
    now: () => now,
    readyTtlMs: 10,
    staleFallbackTtlMs: 50,
    onError: () => undefined,
    fetchBackendResult: async () => {
      calls += 1

      if (calls === 1) {
        return readyBackendResult(validConfig)
      }

      throw new Error("temporary Convex failure")
    },
  })

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: validConfig,
  })

  now = 11

  assert.deepEqual(await cache.get(guildId), {
    status: "ready",
    config: validConfig,
  })

  now = 61

  assert.deepEqual(await cache.get(guildId), {
    status: "disabled",
    reason: "convexUnavailable",
  })
  assert.equal(calls, 3)
})

test("runtime config cache refresh failure without stale fallback does not crash", async () => {
  let now = 0
  let calls = 0
  const cache = createTestCache({
    now: () => now,
    readyTtlMs: 10,
    staleFallbackTtlMs: 0,
    fetchBackendResult: async () => {
      calls += 1
      return calls === 1 ? readyBackendResult(validConfig) : null
    },
  })

  assert.equal((await cache.get(guildId)).status, "ready")

  now = 11

  assert.deepEqual(await cache.get(guildId), {
    status: "disabled",
    reason: "convexUnavailable",
  })
})

test("runtime config cache dispose clears cleanup timer", () => {
  const timer = {
    unref() {
      return this
    },
  } as ReturnType<typeof setInterval>
  let clearedTimer: unknown
  const cache = createTestCache({
    cleanupIntervalMs: 5,
    setInterval: ((
      callback: (...args: unknown[]) => void,
      delay?: number
    ) => {
      assert.equal(typeof callback, "function")
      assert.equal(delay, 5)

      return timer
    }) as typeof setInterval,
    clearInterval: ((handle: Parameters<typeof clearInterval>[0]) => {
      clearedTimer = handle
    }) as typeof clearInterval,
    startCleanupTimer: true,
  })

  cache.dispose()

  assert.equal(clearedTimer, timer)
})

function createTestCache(
  options: ConstructorParameters<typeof DiscordGuildRuntimeConfigCache>[0] = {}
): DiscordGuildRuntimeConfigCache {
  return new DiscordGuildRuntimeConfigCache({
    startCleanupTimer: false,
    ...options,
  })
}

function readyBackendResult(config: DiscordGuildRuntimeConfig): unknown {
  return {
    status: "ready",
    config,
  }
}

function disabledBackendResult(reason: "unknownGuild" | "botLeft" | "missingConfig") {
  return {
    status: "disabled",
    reason,
  }
}

function testGuildId(index: number): string {
  return String(123_456_789_012_345_000n + BigInt(index))
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolveDeferred: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve
  })

  return {
    promise,
    resolve: resolveDeferred,
  }
}
