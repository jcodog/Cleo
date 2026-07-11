import assert from "node:assert/strict"
import { test } from "node:test"

import type { DiscordModerationActionRecordInput } from "../../../../lib/discordModerationActions"
import {
  normaliseModerationActionForStorage,
  sanitiseModerationActionMetadata,
} from "./record"

const now = 1_800_000_000_000
const guildId = "123456789012345678"
const actorId = "234567890123456789"
const targetId = "345678901234567890"

function action(
  overrides: Partial<DiscordModerationActionRecordInput> = {}
): DiscordModerationActionRecordInput {
  return {
    discordGuildId: guildId,
    actionType: "ban",
    actorDiscordUserId: actorId,
    targetDiscordUserId: targetId,
    reason: "Spam token=secret",
    result: "success",
    operationId: `ban:${guildId}:${actorId}:${targetId}:interaction`,
    metadata: {
      commandName: "ban",
    },
    occurredAt: now,
    ...overrides,
  }
}

test("moderation action storage accepts valid actions", () => {
  const normalised = normaliseModerationActionForStorage(action(), now)

  assert.deepEqual(normalised, {
    discordGuildId: guildId,
    actionType: "ban",
    actorDiscordUserId: actorId,
    targetDiscordUserId: targetId,
    reason: "Spam token=[redacted]",
    result: "success",
    operationId: `ban:${guildId}:${actorId}:${targetId}:interaction`,
    metadata: {
      commandName: "ban",
    },
    occurredAt: now,
  })
})

test("moderation action storage rejects malformed guild and user IDs", () => {
  assert.throws(() =>
    normaliseModerationActionForStorage(action({ discordGuildId: "bad" }), now)
  )
  assert.throws(() =>
    normaliseModerationActionForStorage(
      action({ actorDiscordUserId: "bad" }),
      now
    )
  )
  assert.throws(() =>
    normaliseModerationActionForStorage(
      action({ targetDiscordUserId: "bad" }),
      now
    )
  )
})

test("moderation action storage rejects oversized metadata and reason", () => {
  assert.throws(() =>
    normaliseModerationActionForStorage(
      action({
        metadata: {
          value: "x".repeat(5_100),
        },
      }),
      now
    )
  )

  assert.throws(() =>
    normaliseModerationActionForStorage(
      action({
        reason: "x".repeat(513),
      }),
      now
    )
  )
})

test("moderation action storage validates failure code shape", () => {
  assert.throws(() =>
    normaliseModerationActionForStorage(
      action({
        result: "success",
        failureCode: "discordApiFailed",
      }),
      now
    )
  )

  assert.throws(() =>
    normaliseModerationActionForStorage(
      action({
        result: "failed",
        failureCode: undefined,
      }),
      now
    )
  )

  assert.equal(
    normaliseModerationActionForStorage(
      action({
        result: "denied",
        failureCode: "actorMissingPermission",
      }),
      now
    ).failureCode,
    "actorMissingPermission"
  )
})

test("moderation action storage rejects invalid timestamps", () => {
  assert.throws(() =>
    normaliseModerationActionForStorage(action({ occurredAt: -1 }), now)
  )

  assert.throws(() =>
    normaliseModerationActionForStorage(
      action({ occurredAt: now + 5 * 60 * 1000 + 1 }),
      now
    )
  )
})

test("moderation action metadata is redacted and stores no private values", () => {
  assert.deepEqual(
    sanitiseModerationActionMetadata({
      email: "user@example.com",
      token: "secret",
      nested: {
        authorization: "Bearer value",
      },
    }),
    {
      email: "[redacted]",
      token: "[redacted]",
      nested: {
        authorization: "[redacted]",
      },
    }
  )
})
