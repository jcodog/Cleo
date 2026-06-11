import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createLogger,
  isSensitiveLogKey,
  redactLogMetadata,
  redactLogText,
  serializeLogError,
} from "./index"

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
    callbackUrl: "https://user:password@example.com/path?token=secret",
    nested: {
      token: "secret",
      values: [{ password: "hidden" }, "kept"],
    },
  }

  metadata.self = metadata

  assert.deepEqual(redactLogMetadata(metadata), {
    safe: "visible",
    callbackUrl: "https://[redacted]@example.com/path?token=[redacted]",
    nested: {
      token: "[redacted]",
      values: [{ password: "[redacted]" }, "kept"],
    },
    self: "[circular]",
  })
})

test("redactLogText redacts common secret-bearing text", () => {
  assert.equal(
    redactLogText(
      "authorization: Bearer token123 cookie=session=abc token=secret https://u:p@example.com/path?secret=value"
    ),
    "authorization: Bearer [redacted] cookie=[redacted] token=[redacted] https://[redacted]@example.com/path?secret=[redacted]"
  )
})

test("serializeLogError preserves useful error details after redaction", () => {
  const error = new Error(
    "request failed for https://user:pass@example.com/path?token=abc"
  )
  error.cause = {
    authorization: "Bearer hidden",
  }
  error.stack =
    "Error: request failed\n    at fetch (https://user:pass@example.com/path?authorization=abc)"

  assert.deepEqual(serializeLogError(error), {
    name: "Error",
    message: "request failed for https://[redacted]@example.com/path?token=[redacted]",
    stack:
      "Error: request failed\n    at fetch (https://[redacted]@example.com/path?authorization=[redacted])",
    cause: {
      authorization: "[redacted]",
    },
  })
})

test("serializeLogError redacts non-Error values", () => {
  assert.deepEqual(serializeLogError({ cookie: "session=hidden" }), {
    value: {
      cookie: "[redacted]",
    },
  })

  assert.deepEqual(serializeLogError("token=secret"), {
    value: "token=[redacted]",
  })
})

test("createLogger writes redacted structured log payloads", (t) => {
  const lines: string[] = []
  const errors: string[] = []
  const logs: string[] = []
  t.mock.method(console, "warn", (line: string) => {
    lines.push(line)
  })
  t.mock.method(console, "error", (line: string) => {
    errors.push(line)
  })
  t.mock.method(console, "log", (line: string) => {
    logs.push(line)
  })

  const logger = createLogger("test")

  logger.warn("hello", {
    secret: "hidden",
    visible: true,
  })
  logger.error("failed")
  logger.info("ok")

  assert.equal(lines.length, 1)
  assert.equal(errors.length, 1)
  assert.equal(logs.length, 1)

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

  assert.deepEqual(JSON.parse(errors[0] ?? ""), {
    level: "error",
    namespace: "test",
    message: "failed",
  })
  assert.deepEqual(JSON.parse(logs[0] ?? ""), {
    level: "info",
    namespace: "test",
    message: "ok",
  })
})
