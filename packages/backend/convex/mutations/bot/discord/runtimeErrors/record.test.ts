import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assertValidDiscordGuildId,
  buildFingerprint,
  getRuntimeErrorLastSeenAt,
  normaliseRuntimeErrorOccurredAt,
  normaliseOptionalString,
  sanitiseMetadata,
} from "./record"

test("runtime error strings are trimmed, redacted, and truncated", () => {
  assert.equal(
    normaliseOptionalString("  token=secret user@example.com  ", 200),
    "token=[redacted] [redacted]"
  )

  assert.equal(normaliseOptionalString("   ", 200), undefined)
  assert.equal(normaliseOptionalString(undefined, 200), undefined)

  assert.equal(normaliseOptionalString("abcdef", 4), "abc…")
})

test("runtime error Discord guild IDs must be snowflakes", () => {
  assert.doesNotThrow(() => assertValidDiscordGuildId("111111111111111111"))

  assert.doesNotThrow(() => assertValidDiscordGuildId(undefined))

  assert.throws(() => assertValidDiscordGuildId("not-a-snowflake"))
  assert.throws(() => assertValidDiscordGuildId("123"))
})

test("runtime error metadata is redacted and remains JSON serialisable", () => {
  assert.deepEqual(
    sanitiseMetadata({
      emailAddress: "user@example.com",
      nested: {
        token: "secret",
        message: "Contact user@example.com",
      },
    }),
    {
      emailAddress: "[redacted]",
      nested: {
        token: "[redacted]",
        message: "Contact [redacted]",
      },
    }
  )

  assert.equal(sanitiseMetadata(undefined), undefined)
})

test("runtime error metadata rejects oversized payloads", () => {
  assert.throws(() =>
    sanitiseMetadata({
      value: "x".repeat(11_000),
    })
  )
})

test("runtime error fingerprint uses explicit fingerprint when provided", () => {
  assert.equal(
    buildFingerprint({
      fingerprint: " token=secret user@example.com ",
      serviceArea: "welcome",
      severity: "error",
      discordGuildId: "111111111111111111",
      commandName: undefined,
      eventName: "guildMemberAdd",
      operation: "sendWelcome",
      message: "ignored",
    }),
    "token=[redacted] [redacted]"
  )
})

test("runtime error fingerprint falls back to stable incident fields", () => {
  assert.equal(
    buildFingerprint({
      fingerprint: undefined,
      serviceArea: "welcome",
      severity: "error",
      discordGuildId: "111111111111111111",
      commandName: undefined,
      eventName: "guildMemberAdd",
      operation: "sendWelcome",
      message: "Missing permission",
    }),
    "welcome:error:111111111111111111::guildMemberAdd:sendWelcome:Missing permission"
  )
})

test("runtime error fingerprint is bounded", () => {
  const fingerprint = buildFingerprint({
    fingerprint: "x".repeat(1_000),
    serviceArea: "backend",
    severity: "critical",
    discordGuildId: undefined,
    commandName: undefined,
    eventName: undefined,
    operation: undefined,
    message: "ignored",
  })

  assert.equal(fingerprint.length, 512)
  assert.equal(fingerprint.endsWith("…"), true)
})

test("runtime error timestamps are bounded and default to now", () => {
  const now = 1_000_000

  assert.equal(normaliseRuntimeErrorOccurredAt(undefined, now), now)
  assert.equal(normaliseRuntimeErrorOccurredAt(now - 1, now), now - 1)
  assert.throws(() => normaliseRuntimeErrorOccurredAt(-1, now))
  assert.throws(() =>
    normaliseRuntimeErrorOccurredAt(now + 5 * 60 * 1_000 + 1, now)
  )
  assert.throws(() => normaliseRuntimeErrorOccurredAt(1.5, now))
})

test("deduplicated runtime errors never move last-seen time backwards", () => {
  assert.equal(getRuntimeErrorLastSeenAt(200, 100), 200)
  assert.equal(getRuntimeErrorLastSeenAt(200, 300), 300)
})
