import assert from "node:assert/strict"
import { test } from "node:test"

import { botLog, botLogError } from "./botLog"

test("botLog redacts normal message text without changing formatting", (t) => {
  const logLines: string[] = []

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })

  botLog("User user@example.com sent token=secret", "info")

  assert.equal(logLines.length, 1)
  assert.match(logLines[0] ?? "", /INFO\s+/)
  assert.match(logLines[0] ?? "", / \| /)
  assert.match(logLines[0] ?? "", /User \[redacted\] sent token=\[redacted\]/)
  assert.doesNotMatch(logLines[0] ?? "", /user@example\.com|secret/)
})

test("botLogError writes concise sanitized error metadata", (t) => {
  const logLines: string[] = []
  const errorLines: string[] = []
  const error = new Error("failed with Authorization: Bearer secret")

  error.stack = "Error: failed with Authorization: Bearer secret"

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })
  t.mock.method(console, "error", (line: string) => {
    errorLines.push(line)
  })

  botLogError("Operation failed.", error, {
    token: "secret",
    request: {
      headers: {
        authorization: "Bearer secret",
        cookie: "session=secret",
      },
    },
  })

  assert.equal(logLines.length, 1)
  assert.deepEqual(errorLines, [])
  assert.doesNotMatch(logLines[0] ?? "", /Bearer secret/)

  assert.match(logLines[0] ?? "", /Operation failed\./)
  assert.match(logLines[0] ?? "", /Authorization: Bearer \[redacted\]/)
  assert.match(logLines[0] ?? "", /"token":"\[redacted\]"/)
  assert.match(logLines[0] ?? "", /"authorization":"\[redacted\]"/)
  assert.match(logLines[0] ?? "", /"cookie":"\[redacted\]"/)
})

test("botLogError includes sanitized stack context for empty-message errors", (t) => {
  const logLines: string[] = []
  const error = new Error("")

  error.stack =
    "Error\n    at fetch (https://user:pass@example.com/path?token=secret)\n    at action (internal)"

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })

  botLogError("Convex ready guild sync failed.", error)

  assert.equal(logLines.length, 1)
  assert.match(logLines[0] ?? "", /Convex ready guild sync failed\./)
  assert.match(
    logLines[0] ?? "",
    /https:\/\/\[redacted\]@example.com\/path\?token=\[redacted\]/
  )
  assert.doesNotMatch(logLines[0] ?? "", /secret/)
})

test("botLogError formats non-Error values and named empty-message errors", (t) => {
  const logLines: string[] = []
  const namedError = new Error("")

  namedError.name = "AbortError"

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })

  botLogError("Object failure.", {
    authorization: "Bearer secret",
  })
  botLogError("Named failure.", namedError)

  assert.equal(logLines.length, 2)
  assert.match(logLines[0] ?? "", /\{"authorization":"\[redacted\]"\}/)
  assert.match(logLines[1] ?? "", /\(AbortError/)
  assert.doesNotMatch(logLines.join("\n"), /Bearer secret/)
})
