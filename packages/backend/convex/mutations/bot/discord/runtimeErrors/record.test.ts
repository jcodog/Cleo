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
  const args = {
    fingerprint: undefined,
    serviceArea: "welcome",
    severity: "error",
    discordGuildId: "111111111111111111",
    commandName: undefined,
    eventName: "guildMemberAdd",
    operation: "sendWelcome",
    message: "Missing permission",
  }

  const fingerprint = buildFingerprint(args)

  assert.match(fingerprint, /^auto:[0-9a-f]{32}$/)
  assert.equal(buildFingerprint(args), fingerprint)
})

test("runtime error fingerprint hashes oversized explicit values", () => {
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

  assert.match(fingerprint, /^explicit:[0-9a-f]{32}$/)
  assert.notEqual(
    fingerprint,
    buildFingerprint({
      fingerprint: `${"x".repeat(999)}y`,
      serviceArea: "backend",
      severity: "critical",
      discordGuildId: undefined,
      commandName: undefined,
      eventName: undefined,
      operation: undefined,
      message: "ignored",
    })
  )
})

test("runtime error fingerprint keeps structured fields unambiguous", () => {
  const base = {
    fingerprint: undefined,
    serviceArea: "command",
    severity: "error",
    discordGuildId: undefined,
    operation: undefined,
    message: "failed",
  }

  assert.notEqual(
    buildFingerprint({ ...base, commandName: "a:b", eventName: "c" }),
    buildFingerprint({ ...base, commandName: "a", eventName: "b:c" })
  )
})

test("runtime error timestamps are bounded and default to now", () => {
  const now = 1_000_000

  assert.equal(normaliseRuntimeErrorOccurredAt(undefined, now), now)
  assert.equal(normaliseRuntimeErrorOccurredAt(now - 1, now), now - 1)
  assert.equal(
    normaliseRuntimeErrorOccurredAt(now + 5 * 60 * 1_000, now),
    now + 5 * 60 * 1_000
  )
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
