import assert from "node:assert/strict"
import { test } from "node:test"

import { createLogger, isSensitiveLogKey, redactLogMetadata } from "./index"

test("isSensitiveLogKey detects common secret-bearing keys", () => {
  assert.equal(isSensitiveLogKey("authorization"), true)
  assert.equal(isSensitiveLogKey("api-key"), true)
  assert.equal(isSensitiveLogKey("refreshToken"), true)
  assert.equal(isSensitiveLogKey("session_cookie"), true)
  assert.equal(isSensitiveLogKey("displayName"), false)
})

test("redactLogMetadata redacts nested secrets and circular references", () => {
  const metadata: Record<string, unknown> = {
    safe: "visible",
    nested: {
      token: "secret",
      values: [{ password: "hidden" }, "kept"],
    },
  }

  metadata.self = metadata

  assert.deepEqual(redactLogMetadata(metadata), {
    safe: "visible",
    nested: {
      token: "[redacted]",
      values: [{ password: "[redacted]" }, "kept"],
    },
    self: "[circular]",
  })
})

test("createLogger writes redacted structured log payloads", (t) => {
  const lines: string[] = []
  t.mock.method(console, "warn", (line: string) => {
    lines.push(line)
  })

  createLogger("test").warn("hello", {
    secret: "hidden",
    visible: true,
  })

  assert.equal(lines.length, 1)

  const [line] = lines
  assert.ok(line)
  assert.deepEqual(JSON.parse(line), {
    level: "warn",
    namespace: "test",
    message: "hello",
    metadata: {
      secret: "[redacted]",
      visible: true,
    },
  })
})
