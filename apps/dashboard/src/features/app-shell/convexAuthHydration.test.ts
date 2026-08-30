import assert from "node:assert/strict"
import test from "node:test"

import { getConvexAuthHydrationResult } from "./convexAuthHydration"

test("keeps a valid preload authoritative during initial Convex authentication", () => {
  const preloadedResult = [{ discordGuildId: "111111111111111111" }]

  assert.equal(
    getConvexAuthHydrationResult({
      hasAuthenticationResolved: false,
      isAuthenticated: false,
      isLoading: true,
      liveResult: [],
      preloadedResult,
    }),
    preloadedResult
  )
})

test("uses live results once Convex authentication succeeds", () => {
  const liveResult = [{ discordGuildId: "222222222222222222" }]

  assert.equal(
    getConvexAuthHydrationResult({
      hasAuthenticationResolved: true,
      isAuthenticated: true,
      isLoading: false,
      liveResult,
      preloadedResult: [{ discordGuildId: "111111111111111111" }],
    }),
    liveResult
  )
})

test("clears preloaded identity data after authentication resolves unauthenticated", () => {
  assert.equal(
    getConvexAuthHydrationResult({
      hasAuthenticationResolved: true,
      isAuthenticated: false,
      isLoading: false,
      liveResult: [{ discordGuildId: "111111111111111111" }],
      preloadedResult: [{ discordGuildId: "111111111111111111" }],
    }),
    undefined
  )
})

test("does not restore preloaded identity data during a later auth transition", () => {
  assert.equal(
    getConvexAuthHydrationResult({
      hasAuthenticationResolved: true,
      isAuthenticated: false,
      isLoading: true,
      liveResult: [{ discordGuildId: "111111111111111111" }],
      preloadedResult: [{ discordGuildId: "111111111111111111" }],
    }),
    undefined
  )
})
