import type { Client, ShardingManager } from "discord.js"

import {
  reportDiscordRuntimeError,
  type DiscordRuntimeErrorReporter,
} from "@/services/runtimeErrorReporter"
import { botLog, botLogError } from "@/utils/botLog"

export type DiscordBotShutdownReason =
  | "SIGINT"
  | "SIGTERM"
  | "startupFailure"
  | "unhandledRejection"
  | "uncaughtException"

type CleanupHook = () => Promise<void> | void

type ShutdownOptions = {
  client: Client
  reason: DiscordBotShutdownReason
  exitCode: number
  error?: unknown
  exit?: (code?: number) => void
  reportRuntimeError?: DiscordRuntimeErrorReporter
  stepTimeoutMs?: number
}

type ShardingManagerShutdownOptions = {
  manager: ShardingManager
  reason: DiscordBotShutdownReason
  exitCode: number
  error?: unknown
  exit?: (code?: number) => void
  reportRuntimeError?: DiscordRuntimeErrorReporter
  stepTimeoutMs?: number
}

const cleanupHooks = new Set<CleanupHook>()
const DEFAULT_SHUTDOWN_STEP_TIMEOUT_MS = 5_000

export function registerCleanupHook(hook: CleanupHook): () => void {
  cleanupHooks.add(hook)

  return () => {
    cleanupHooks.delete(hook)
  }
}

export async function shutdownDiscordBot({
  client,
  reason,
  exitCode,
  error,
  exit = process.exit,
  reportRuntimeError = reportDiscordRuntimeError,
  stepTimeoutMs = DEFAULT_SHUTDOWN_STEP_TIMEOUT_MS,
}: ShutdownOptions): Promise<void> {
  const reportedError = getShutdownError(reason, error)

  if (reportedError !== undefined) {
    botLogError(`Discord bot shutdown triggered: ${reason}`, reportedError, {
      reason,
    })
    await reportStartupOrFatalError({
      error: reportedError,
      reason,
      runtime: "bot",
      reportRuntimeError,
      stepTimeoutMs,
    })
  } else {
    botLog(`Discord bot shutdown requested: ${reason}`, "warn")
  }

  try {
    client.destroy()
  } catch (cleanupError) {
    botLogError("Discord bot shutdown cleanup failed.", cleanupError, {
      reason,
    })
  }

  await runCleanupHooks("Discord bot", reason, stepTimeoutMs)

  process.exitCode = exitCode
  exit(exitCode)
}

export async function shutdownDiscordShardingManager({
  manager,
  reason,
  exitCode,
  error,
  exit = process.exit,
  reportRuntimeError = reportDiscordRuntimeError,
  stepTimeoutMs = DEFAULT_SHUTDOWN_STEP_TIMEOUT_MS,
}: ShardingManagerShutdownOptions): Promise<void> {
  const reportedError = getShutdownError(reason, error)

  if (reportedError !== undefined) {
    botLogError(
      `Discord sharding manager shutdown triggered: ${reason}`,
      reportedError,
      {
        reason,
      }
    )
    await reportStartupOrFatalError({
      error: reportedError,
      reason,
      runtime: "shardingManager",
      reportRuntimeError,
      stepTimeoutMs,
    })
  } else {
    botLog(`Discord sharding manager shutdown requested: ${reason}`, "warn")
  }

  try {
    manager.respawn = false

    for (const shard of manager.shards.values()) {
      try {
        shard.kill()
      } catch (cleanupError) {
        botLogError("Discord shard shutdown cleanup failed.", cleanupError, {
          reason,
          shardId: shard.id,
        })
      }
    }
  } catch (cleanupError) {
    botLogError("Discord sharding manager cleanup failed.", cleanupError, {
      reason,
    })
  }

  await runCleanupHooks("Discord sharding manager", reason, stepTimeoutMs)

  process.exitCode = exitCode
  exit(exitCode)
}

async function reportStartupOrFatalError({
  error,
  reason,
  runtime,
  reportRuntimeError,
  stepTimeoutMs,
}: {
  error: unknown
  reason: DiscordBotShutdownReason
  runtime: "bot" | "shardingManager"
  reportRuntimeError: DiscordRuntimeErrorReporter
  stepTimeoutMs: number
}): Promise<void> {
  if (!isStartupOrFatalReason(reason)) {
    return
  }

  try {
    await runShutdownStep(
      () =>
        reportRuntimeError({
          severity: "critical",
          serviceArea: "startup",
          message: `Discord bot runtime fatal error: ${reason}`,
          error,
          operation: "startupOrFatalShutdown",
          fingerprint: `startup:startupOrFatalShutdown:${reason}:${runtime}`,
          metadata: {
            reason,
            runtime,
          },
        }),
      "runtime error report",
      stepTimeoutMs
    )
  } catch (reportError) {
    botLogError("Discord startup runtime error report failed.", reportError, {
      reason,
      runtime,
    })
  }
}

async function runCleanupHooks(
  runtimeLabel: string,
  reason: DiscordBotShutdownReason,
  stepTimeoutMs: number
): Promise<void> {
  for (const cleanupHook of Array.from(cleanupHooks)) {
    try {
      await runShutdownStep(cleanupHook, "cleanup hook", stepTimeoutMs)
    } catch (cleanupError) {
      botLogError(
        `${runtimeLabel} shutdown cleanup hook failed.`,
        cleanupError,
        {
          reason,
        }
      )
    }
  }
}

function getShutdownError(
  reason: DiscordBotShutdownReason,
  error: unknown
): unknown | undefined {
  if (error !== undefined) {
    return error
  }

  if (isStartupOrFatalReason(reason)) {
    return new Error(
      `Discord runtime terminated without an error value: ${reason}`
    )
  }

  return undefined
}

async function runShutdownStep<T>(
  step: () => Promise<T> | T,
  label: string,
  timeoutMs: number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      Promise.resolve().then(step),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Discord shutdown ${label} timed out.`)),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

function isStartupOrFatalReason(reason: DiscordBotShutdownReason): boolean {
  return (
    reason === "startupFailure" ||
    reason === "unhandledRejection" ||
    reason === "uncaughtException"
  )
}
