import assert from "node:assert/strict"
import { test } from "node:test"

import {
  getDesiredGuildMetricsContribution,
  getTrackedGuildMetricsContribution,
} from "./staffDiscordMetrics"

test("tracked guild metrics count only active, initialized guilds", () => {
  assert.deepEqual(
    getTrackedGuildMetricsContribution({
      botLeftAt: undefined,
      memberCount: 42,
      staffMetricsTracked: true,
    }),
    { guildCount: 1, memberCount: 42 }
  )

  assert.deepEqual(
    getTrackedGuildMetricsContribution({
      botLeftAt: 2_000,
      memberCount: 42,
      staffMetricsTracked: true,
    }),
    { guildCount: 0, memberCount: 0 }
  )

  assert.deepEqual(
    getTrackedGuildMetricsContribution({
      botLeftAt: undefined,
      memberCount: 42,
      staffMetricsTracked: undefined,
    }),
    { guildCount: 0, memberCount: 0 }
  )
})

test("desired guild metrics count active guilds without requiring join timestamps", () => {
  assert.deepEqual(
    getDesiredGuildMetricsContribution({
      botLeftAt: undefined,
      memberCount: 25,
    }),
    { guildCount: 1, memberCount: 25 }
  )

  assert.deepEqual(
    getDesiredGuildMetricsContribution({
      botLeftAt: 3_000,
      memberCount: 25,
    }),
    { guildCount: 0, memberCount: 0 }
  )
})
