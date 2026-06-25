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
}

type ShardingManagerShutdownOptions = {
  manager: ShardingManager
  reason: DiscordBotShutdownReason
  exitCode: number
  error?: unknown
  exit?: (code?: number) => void
  reportRuntimeError?: DiscordRuntimeErrorReporter
}

const cleanupHooks = new Set<CleanupHook>()

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
}: ShutdownOptions): Promise<void> {
  if (error) {
    botLogError(`Discord bot shutdown triggered: ${reason}`, error, {
      reason,
    })
    reportStartupOrFatalError({
      error,
      reason,
      runtime: "bot",
      reportRuntimeError,
    })
  } else {
    botLog(`Discord bot shutdown requested: ${reason}`, "warn")
  }

  try {
    client.destroy()

    for (const cleanupHook of Array.from(cleanupHooks)) {
      await cleanupHook()
    }
  } catch (cleanupError) {
    botLogError("Discord bot shutdown cleanup failed.", cleanupError, {
      reason,
    })
  } finally {
    process.exitCode = exitCode
    exit(exitCode)
  }
}

export async function shutdownDiscordShardingManager({
  manager,
  reason,
  exitCode,
  error,
  exit = process.exit,
  reportRuntimeError = reportDiscordRuntimeError,
}: ShardingManagerShutdownOptions): Promise<void> {
  if (error) {
    botLogError(
      `Discord sharding manager shutdown triggered: ${reason}`,
      error,
      {
        reason,
      }
    )
    reportStartupOrFatalError({
      error,
      reason,
      runtime: "shardingManager",
      reportRuntimeError,
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

    for (const cleanupHook of Array.from(cleanupHooks)) {
      await cleanupHook()
    }
  } catch (cleanupError) {
    botLogError("Discord sharding manager cleanup failed.", cleanupError, {
      reason,
    })
  } finally {
    process.exitCode = exitCode
    exit(exitCode)
  }
}

function reportStartupOrFatalError({
  error,
  reason,
  runtime,
  reportRuntimeError,
}: {
  error: unknown
  reason: DiscordBotShutdownReason
  runtime: "bot" | "shardingManager"
  reportRuntimeError: DiscordRuntimeErrorReporter
}): void {
  if (!isStartupOrFatalReason(reason)) {
    return
  }

  void (async () => {
    try {
      await reportRuntimeError({
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
      })
    } catch (reportError) {
      botLogError("Discord startup runtime error report failed.", reportError, {
        reason,
        runtime,
      })
    }
  })()
}

function isStartupOrFatalReason(reason: DiscordBotShutdownReason): boolean {
  return (
    reason === "startupFailure" ||
    reason === "unhandledRejection" ||
    reason === "uncaughtException"
  )
}
