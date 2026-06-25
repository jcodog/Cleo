import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildDiscordRuntimeErrorReport,
  reportDiscordRuntimeError,
} from "@/services/runtimeErrorReporter"
import type {
  DiscordBotRuntimeErrorReport,
  DiscordBotRuntimeErrorReportResult,
} from "@/services/convexBotClient"

test("buildDiscordRuntimeErrorReport uses explicit message and context", () => {
  const report = buildDiscordRuntimeErrorReport({
    severity: "error",
    serviceArea: "welcome",
    message: "Failed to send welcome message",
    discordGuildId: "111111111111111111",
    eventName: "guildMemberAdd",
    operation: "sendWelcome",
    fingerprint: "welcome:send:111111111111111111",
    metadata: {
      channelId: "222222222222222222",
    },
    occurredAt: 123,
  })

  assert.equal(report.severity, "error")
  assert.equal(report.serviceArea, "welcome")
  assert.equal(report.message, "Failed to send welcome message")
  assert.equal(report.discordGuildId, "111111111111111111")
  assert.equal(report.eventName, "guildMemberAdd")
  assert.equal(report.operation, "sendWelcome")
  assert.equal(report.fingerprint, "welcome:send:111111111111111111")
  assert.equal(report.occurredAt, 123)
  assert.deepEqual(report.metadata, {
    channelId: "222222222222222222",
  })
})

test("buildDiscordRuntimeErrorReport serializes and redacts error details", () => {
  const report = buildDiscordRuntimeErrorReport({
    severity: "critical",
    serviceArea: "backend",
    error: new Error("token=secret user@example.com"),
    operation: "convexRequest",
    metadata: {
      emailAddress: "user@example.com",
      nested: {
        token: "secret",
      },
    },
  })

  assert.equal(report.message, "token=[redacted] [redacted]")
  assert.equal(report.operation, "convexRequest")

  assert.deepEqual(report.metadata, {
    emailAddress: "[redacted]",
    nested: {
      token: "[redacted]",
    },
    error: {
      name: "Error",
      message: "token=[redacted] [redacted]",
      stack: report.stack,
    },
  })
})

test("buildDiscordRuntimeErrorReport falls back to default message", () => {
  const report = buildDiscordRuntimeErrorReport({
    severity: "warn",
    serviceArea: "unknown",
  })

  assert.equal(report.message, "Discord bot runtime error reported.")
})

test("reportDiscordRuntimeError sends built report", async () => {
  let sentReport: DiscordBotRuntimeErrorReport | undefined

  const result: DiscordBotRuntimeErrorReportResult = {
    id: "runtime_error_id" as DiscordBotRuntimeErrorReportResult["id"],
    deduplicated: false,
    occurrenceCount: 1,
  }

  const response = await reportDiscordRuntimeError(
    {
      severity: "error",
      serviceArea: "welcome",
      message: "Renderer failed",
      discordGuildId: "111111111111111111",
      eventName: "guildMemberAdd",
      operation: "renderWelcomeCard",
    },
    {
      sendReport: async (report) => {
        sentReport = report
        return result
      },
    }
  )

  assert.deepEqual(response, result)
  assert.equal(sentReport?.severity, "error")
  assert.equal(sentReport?.serviceArea, "welcome")
  assert.equal(sentReport?.message, "Renderer failed")
  assert.equal(sentReport?.discordGuildId, "111111111111111111")
  assert.equal(sentReport?.eventName, "guildMemberAdd")
  assert.equal(sentReport?.operation, "renderWelcomeCard")
})

test("reportDiscordRuntimeError swallows reporting failure and logs locally", async () => {
  let loggedMessage: string | undefined
  let loggedError: unknown
  let loggedMetadata: unknown

  const response = await reportDiscordRuntimeError(
    {
      severity: "error",
      serviceArea: "transport",
      message: "Transport failed",
      discordGuildId: "111111111111111111",
      operation: "reportRuntimeError",
    },
    {
      sendReport: async () => {
        throw new Error("convex unavailable")
      },
      logError: (message, error, metadata) => {
        loggedMessage = message
        loggedError = error
        loggedMetadata = metadata
      },
    }
  )

  assert.equal(response, null)
  assert.equal(loggedMessage, "Discord runtime error reporting failed.")
  assert.ok(loggedError instanceof Error)
  assert.deepEqual(loggedMetadata, {
    originalServiceArea: "transport",
    originalSeverity: "error",
    originalOperation: "reportRuntimeError",
    originalDiscordGuildId: "111111111111111111",
  })
})
