import assert from "node:assert/strict"
import { test } from "node:test"

import type { Client } from "discord.js"

import { registerCleanupHook, shutdownDiscordBot } from "./shutdown"
import type { DiscordRuntimeErrorReportInput } from "@/services/runtimeErrorReporter"

type TestClient = Client & {
  destroyedForTest: boolean
}

function createClient(): TestClient {
  return {
    destroyedForTest: false,
    destroy() {
      this.destroyedForTest = true
    },
  } as TestClient
}

async function noopRuntimeErrorReporter() {
  return null
}

test("shutdown destroys the Discord client and runs cleanup hooks", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const cleanupCalls: string[] = []
  const exitCodes: number[] = []
  const unregisterCleanup = registerCleanupHook(() => {
    cleanupCalls.push("cleanup")
  })

  t.mock.method(console, "log", () => undefined)
  t.after(() => {
    unregisterCleanup()
    process.exitCode = previousExitCode
  })

  await shutdownDiscordBot({
    client,
    reason: "SIGTERM",
    exitCode: 0,
    exit(code) {
      exitCodes.push(code ?? 0)
    },
    reportRuntimeError: noopRuntimeErrorReporter,
  })

  assert.equal(client.destroyedForTest, true)
  assert.deepEqual(cleanupCalls, ["cleanup"])
  assert.deepEqual(exitCodes, [0])
})

test("fatal shutdown logs through botLogError and exits non-zero", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const logLines: string[] = []
  const exitCodes: number[] = []

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })
  t.after(() => {
    process.exitCode = previousExitCode
  })

  await shutdownDiscordBot({
    client,
    reason: "unhandledRejection",
    exitCode: 1,
    error: new Error("failed with Authorization: Bearer secret"),
    exit(code) {
      exitCodes.push(code ?? 0)
    },
    reportRuntimeError: noopRuntimeErrorReporter,
  })

  assert.equal(client.destroyedForTest, true)
  assert.deepEqual(exitCodes, [1])
  assert.equal(logLines.length, 1)
  assert.match(logLines[0] ?? "", /Authorization: Bearer \[redacted\]/)
  assert.match(logLines[0] ?? "", /"reason":"unhandledRejection"/)
})

test("shutdown logs cleanup failures and still exits", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const logLines: string[] = []
  const exitCodes: number[] = []
  const unregisterCleanup = registerCleanupHook(() => {
    throw new Error("cleanup failed token=secret")
  })

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })
  t.after(() => {
    unregisterCleanup()
    process.exitCode = previousExitCode
  })

  await shutdownDiscordBot({
    client,
    reason: "SIGINT",
    exitCode: 0,
    exit(code) {
      exitCodes.push(code ?? 0)
    },
    reportRuntimeError: noopRuntimeErrorReporter,
  })

  assert.equal(client.destroyedForTest, true)
  assert.deepEqual(exitCodes, [0])
  assert.equal(logLines.length, 2)
  assert.match(logLines[1] ?? "", /cleanup failed token=\[redacted\]/)
  assert.match(logLines[1] ?? "", /"reason":"SIGINT"/)
})

test("fatal shutdown reports one startup runtime incident", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const reports: DiscordRuntimeErrorReportInput[] = []

  t.mock.method(console, "log", () => undefined)
  t.after(() => {
    process.exitCode = previousExitCode
  })

  await shutdownDiscordBot({
    client,
    reason: "startupFailure",
    exitCode: 1,
    error: new Error("startup failed"),
    exit() {
      return undefined
    },
    async reportRuntimeError(input) {
      reports.push(input)
      return null
    },
  })

  assert.equal(reports.length, 1)
  assert.equal(reports[0]?.severity, "critical")
  assert.equal(reports[0]?.serviceArea, "startup")
  assert.equal(reports[0]?.operation, "startupOrFatalShutdown")
  assert.equal(
    reports[0]?.fingerprint,
    "startup:startupOrFatalShutdown:startupFailure:bot"
  )
})

test("startup runtime reporter failure is swallowed locally", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const logLines: string[] = []

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })
  t.after(() => {
    process.exitCode = previousExitCode
  })

  await assert.doesNotReject(async () => {
    await shutdownDiscordBot({
      client,
      reason: "uncaughtException",
      exitCode: 1,
      error: new Error("fatal failed"),
      exit() {
        return undefined
      },
      async reportRuntimeError() {
        throw new Error("report failed")
      },
    })
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(logLines.length, 2)
  assert.match(
    logLines[1] ?? "",
    /Discord startup runtime error report failed\./
  )
})
