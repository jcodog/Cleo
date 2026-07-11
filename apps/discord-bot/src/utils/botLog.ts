import {
  redactLogMetadata,
  redactLogText,
  serializeLogError,
  type LogMetadata,
} from "@workspace/logger"

type BotLogLevel = "info" | "success" | "warn" | "error" | "debug"

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
} as const

const levelColors = {
  info: colors.cyan,
  success: colors.green,
  warn: colors.yellow,
  error: colors.red,
  debug: colors.magenta,
} satisfies Record<BotLogLevel, string>

const levelWidth = 7

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function getTimestamp(): string {
  const now = new Date()

  const day = pad(now.getDate())
  const month = pad(now.getMonth() + 1)
  const year = now.getFullYear()

  const hours = pad(now.getHours())
  const minutes = pad(now.getMinutes())
  const seconds = pad(now.getSeconds())

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

export function botLog(message: string, level: BotLogLevel = "info"): void {
  const timestamp = `${colors.dim}[${getTimestamp()}]${colors.reset}`
  const levelLabel = level.toUpperCase().padEnd(levelWidth, " ")
  const coloredLevel = `${levelColors[level]}${levelLabel}${colors.reset}`
  const redactedMessage = redactLogText(message)

  const line = `${timestamp} ${coloredLevel} | ${redactedMessage}`

  if (level === "error") {
    console.error(line)
    return
  }

  console.log(line)
}

export function botLogError(
  message: string,
  error?: unknown,
  metadata?: LogMetadata
): void {
  const details = [
    redactLogText(message),
    ...(error ? [formatErrorSummary(error)] : []),
    ...(metadata ? [formatMetadataSummary(metadata)] : []),
  ].filter((detail) => detail.length > 0)

  botLog(details.join(" "), "error")
}

function formatErrorSummary(error: unknown): string {
  const serializedError = serializeLogError(error)
  const errorName =
    typeof serializedError.name === "string" ? serializedError.name : undefined
  const errorMessage =
    typeof serializedError.message === "string" ? serializedError.message : ""

  if (errorMessage) {
    return `(${errorName ?? "Error"}: ${errorMessage})`
  }

  if (typeof serializedError.stack === "string" && serializedError.stack) {
    return `(${errorName ?? "Error"}: ${formatStackSummary(serializedError.stack)})`
  }

  if (errorName && errorName !== "Error") {
    return `(${errorName})`
  }

  if ("value" in serializedError) {
    return `(${JSON.stringify(serializedError.value)})`
  }

  return ""
}

function formatStackSummary(stack: string): string {
  return stack
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ")
}

function formatMetadataSummary(metadata: LogMetadata): string {
  return JSON.stringify(redactLogMetadata(metadata))
}
