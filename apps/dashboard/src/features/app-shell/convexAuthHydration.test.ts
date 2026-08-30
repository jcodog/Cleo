import assert from "node:assert/strict"
import test from "node:test"

import { getConvexAuthHydrationResult } from "./convexAuthHydration"

test("keeps a valid preload authoritative until Convex authentication is ready", () => {
  const preloadedResult = [{ discordGuildId: "111111111111111111" }]

  assert.equal(
    getConvexAuthHydrationResult({
      isAuthenticated: false,
      liveResult: [],
      preloadedResult,
    }),
    preloadedResult
  )
})

test("uses authenticated live results after Convex authentication is ready", () => {
  const liveResult = [{ discordGuildId: "222222222222222222" }]

  assert.equal(
    getConvexAuthHydrationResult({
      isAuthenticated: true,
      liveResult,
      preloadedResult: [{ discordGuildId: "111111111111111111" }],
    }),
    liveResult
  )
})
