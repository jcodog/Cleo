import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
  assert.equal(isSensitiveLogKey("email"), true)
  assert.equal(isSensitiveLogKey("emailAddress"), true)
  assert.equal(isSensitiveLogKey("email_address"), true)
  assert.equal(isSensitiveLogKey("userEmail"), true)
  assert.equal(isSensitiveLogKey("displayName"), false)
})

test("redactLogMetadata redacts nested secrets and circular references", () => {
  const metadata: Record<string, unknown> = {
    safe: "visible",
    email: "root@example.com",
    email_address: "snake@example.com",
    userEmail: "owner@example.com",
    callbackUrl: "https://user:password@example.com/path?token=secret",
    nested: {
      token: "secret",
      values: [{ password: "hidden" }, "kept"],
      profile: {
        emailAddress: "user@example.com",
      },
    },
    audit: {
      message: "Invite sent to friend@example.com",
    },
  }

  metadata.self = metadata

  assert.deepEqual(redactLogMetadata(metadata), {
    safe: "visible",
    email: "[redacted]",
    email_address: "[redacted]",
    userEmail: "[redacted]",
    callbackUrl: "https://[redacted]@example.com/path?token=[redacted]",
    nested: {
      token: "[redacted]",
      values: [{ password: "[redacted]" }, "kept"],
      profile: {
        emailAddress: "[redacted]",
      },
    },
    audit: {
      message: "Invite sent to [redacted]",
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

  assert.equal(
    redactLogText("user email is person@example.com"),
    "user email is [redacted]"
  )
})

test("serializeLogError preserves useful error details after redaction", () => {
  const error = new Error(
    "request failed for https://user:pass@example.com/path?token=abc and person@example.com"
  )
  error.cause = {
    authorization: "Bearer hidden",
  }
  error.stack =
    "Error: request failed for person@example.com\n    at fetch (https://user:pass@example.com/path?authorization=abc)"

  assert.deepEqual(serializeLogError(error), {
    name: "Error",
    message:
      "request failed for https://[redacted]@example.com/path?token=[redacted] and [redacted]",
    stack:
      "Error: request failed for [redacted]\n    at fetch (https://[redacted]@example.com/path?authorization=[redacted])",
    cause: {
      authorization: "[redacted]",
    },
  })

  const plainError = serializeLogError(new Error("plain failure"))

  assert.equal(plainError.name, "Error")
  assert.equal(plainError.message, "plain failure")
  assert.equal("cause" in plainError, false)
  assert.equal(typeof plainError.stack, "string")

  const stacklessError = new Error("stackless failure")

  stacklessError.stack = undefined

  assert.deepEqual(serializeLogError(stacklessError), {
    name: "Error",
    message: "stackless failure",
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
  logger.error("failed for user@example.com with token=secret")
  logger.info("ok")
  logger.debug("debug ok")

  assert.equal(lines.length, 1)
  assert.equal(errors.length, 1)
  assert.equal(logs.length, 2)

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
    message: "failed for [redacted] with token=[redacted]",
  })
  assert.deepEqual(JSON.parse(logs[0] ?? ""), {
    level: "info",
    namespace: "test",
    message: "ok",
  })
  assert.deepEqual(JSON.parse(logs[1] ?? ""), {
    level: "debug",
    namespace: "test",
    message: "debug ok",
  })
})

test("@workspace/logger is not coupled to Convex or Discord runtime reporting", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  const packageJson = readFileSync(
    new URL("../package.json", import.meta.url),
    "utf8"
  )

  assert.doesNotMatch(source, /convex/i)
  assert.doesNotMatch(source, /runtimeErrorReporter/)
  assert.doesNotMatch(source, /reportRuntimeError/)
  assert.doesNotMatch(source, /discord/i)
  assert.doesNotMatch(packageJson, /convex/i)
  assert.doesNotMatch(packageJson, /discord/i)
})
