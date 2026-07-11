import assert from "node:assert/strict"
import { test } from "node:test"

import type { Client } from "discord.js"

import {
  registerCleanupHook,
  shutdownDiscordBot,
  terminateShard,
} from "./shutdown"
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

test("shard termination waits for the Discord.js death event", async () => {
  let deathListener: (() => void) | undefined
  let killCalls = 0
  const shard = {
    process: {} as never,
    worker: null,
    once(event: string, listener: () => void) {
      assert.equal(event, "death")
      deathListener = listener
      return this
    },
    kill() {
      killCalls += 1
      queueMicrotask(() => deathListener?.())
    },
  } as unknown as Parameters<typeof terminateShard>[0]

  await terminateShard(shard)

  assert.equal(killCalls, 1)
})

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
  const errorLines: string[] = []
  const exitCodes: number[] = []

  t.mock.method(console, "error", (line: string) => {
    errorLines.push(line)
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
  assert.equal(errorLines.length, 1)
  assert.match(errorLines[0] ?? "", /Authorization: \[redacted\]/)
  assert.match(errorLines[0] ?? "", /"reason":"unhandledRejection"/)
})

test("shutdown logs cleanup failures and still exits", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const logLines: string[] = []
  const errorLines: string[] = []
  const exitCodes: number[] = []
  const cleanupCalls: string[] = []
  const unregisterFailingCleanup = registerCleanupHook(() => {
    throw new Error("cleanup failed token=secret")
  })
  const unregisterSuccessfulCleanup = registerCleanupHook(() => {
    cleanupCalls.push("cleanup")
  })

  t.mock.method(console, "log", (line: string) => {
    logLines.push(line)
  })
  t.mock.method(console, "error", (line: string) => {
    errorLines.push(line)
  })
  t.after(() => {
    unregisterFailingCleanup()
    unregisterSuccessfulCleanup()
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
  assert.deepEqual(cleanupCalls, ["cleanup"])
  assert.equal(logLines.length, 1)
  assert.equal(errorLines.length, 1)
  assert.match(errorLines[0] ?? "", /cleanup failed token=\[redacted\]/)
  assert.match(errorLines[0] ?? "", /"reason":"SIGINT"/)
})

test("fatal shutdown reports one startup runtime incident", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const reports: DiscordRuntimeErrorReportInput[] = []
  const sequence: string[] = []

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
      sequence.push("exit")
      return undefined
    },
    async reportRuntimeError(input) {
      await new Promise((resolve) => setImmediate(resolve))
      reports.push(input)
      sequence.push("report")
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
  assert.deepEqual(sequence, ["report", "exit"])
})

test("startup runtime reporter failure is swallowed locally", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const errorLines: string[] = []
  const exitCodes: number[] = []

  t.mock.method(console, "error", (line: string) => {
    errorLines.push(line)
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
      exit(code) {
        exitCodes.push(code ?? 0)
      },
      async reportRuntimeError() {
        throw new Error("report failed")
      },
    })
  })
  assert.equal(client.destroyedForTest, true)
  assert.deepEqual(exitCodes, [1])
  assert.equal(errorLines.length, 2)
  assert.match(
    errorLines[1] ?? "",
    /Discord startup runtime error report failed\./
  )
})

test("fatal shutdown reports even when the rejection value is missing", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const reports: DiscordRuntimeErrorReportInput[] = []

  t.mock.method(console, "log", () => undefined)
  t.after(() => {
    process.exitCode = previousExitCode
  })

  await shutdownDiscordBot({
    client,
    reason: "unhandledRejection",
    exitCode: 1,
    exit() {
      return undefined
    },
    async reportRuntimeError(input) {
      reports.push(input)
      return null
    },
  })

  assert.equal(reports.length, 1)
  assert.ok(reports[0]?.error instanceof Error)
})

test("fatal shutdown bounds a stalled runtime reporter", async (t) => {
  const previousExitCode = process.exitCode
  const client = createClient()
  const exitCodes: number[] = []

  t.mock.method(console, "log", () => undefined)
  t.after(() => {
    process.exitCode = previousExitCode
  })

  await shutdownDiscordBot({
    client,
    reason: "startupFailure",
    exitCode: 1,
    error: new Error("startup failed"),
    stepTimeoutMs: 5,
    exit(code) {
      exitCodes.push(code ?? 0)
    },
    async reportRuntimeError() {
      return await new Promise(() => undefined)
    },
  })

  assert.equal(client.destroyedForTest, true)
  assert.deepEqual(exitCodes, [1])
})
