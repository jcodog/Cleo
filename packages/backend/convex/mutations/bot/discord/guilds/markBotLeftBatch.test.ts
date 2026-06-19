import assert from "node:assert/strict"
import { test } from "node:test"

import { shouldMarkReadyShardGuildAbsent } from "./markBotLeftBatch"

test("READY shard reconciliation marks only absent active guilds", () => {
  assert.equal(
    shouldMarkReadyShardGuildAbsent(
      {
        discordGuildId: "111111111111111111",
        lastSyncedAt: 2_000,
      },
      2_000
    ),
    false
  )

  assert.equal(
    shouldMarkReadyShardGuildAbsent(
      {
        discordGuildId: "222222222222222222",
        lastSyncedAt: 1_000,
      },
      2_000
    ),
    true
  )

  assert.equal(
    shouldMarkReadyShardGuildAbsent(
      {
        discordGuildId: "333333333333333333",
        botLeftAt: 1_500,
        lastSyncedAt: 1_500,
      },
      2_000
    ),
    false
  )
})

test("READY shard reconciliation preserves newer presence timestamps", () => {
  assert.equal(
    shouldMarkReadyShardGuildAbsent(
      {
        discordGuildId: "222222222222222222",
        lastSyncedAt: 2_000,
      },
      2_000
    ),
    false
  )

  assert.equal(
    shouldMarkReadyShardGuildAbsent(
      {
        discordGuildId: "222222222222222222",
        botInstallationVerifiedAt: 2_500,
      },
      2_000
    ),
    false
  )
})
