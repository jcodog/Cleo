import type { LogLevel } from "@workspace/shared"

export type LogMetadata = Record<string, unknown>

export type Logger = {
  debug: (message: string, metadata?: LogMetadata) => void
  info: (message: string, metadata?: LogMetadata) => void
  warn: (message: string, metadata?: LogMetadata) => void
  error: (message: string, metadata?: LogMetadata) => void
}

const SENSITIVE_KEY_PARTS = [
  "api_key",
  "apikey",
  "authorization",
  "authheader",
  "cookie",
  "jwt",
  "password",
  "refresh_token",
  "secret",
  "session",
  "token",
] as const

const REDACTED = "[redacted]"

export function isSensitiveLogKey(key: string): boolean {
  const normalized = key.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase()

  return SENSITIVE_KEY_PARTS.some((part) =>
    normalized.includes(part.replaceAll("_", ""))
  )
}

export function redactLogMetadata<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T
}

export function createLogger(namespace: string): Logger {
  return {
    debug: (message, metadata) => writeLog("debug", namespace, message, metadata),
    info: (message, metadata) => writeLog("info", namespace, message, metadata),
    warn: (message, metadata) => writeLog("warn", namespace, message, metadata),
    error: (message, metadata) => writeLog("error", namespace, message, metadata),
  }
}

function writeLog(
  level: LogLevel,
  namespace: string,
  message: string,
  metadata?: LogMetadata
) {
  const payload = {
    level,
    namespace,
    message,
    ...(metadata ? { metadata: redactLogMetadata(metadata) } : {}),
  }

  const line = JSON.stringify(payload)

  if (level === "error") {
    console.error(line)
    return
  }

  if (level === "warn") {
    console.warn(line)
    return
  }

  console.log(line)
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  if (seen.has(value)) {
    return "[circular]"
  }

  seen.add(value)

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      isSensitiveLogKey(key) ? REDACTED : redactValue(nested, seen),
    ])
  )
}
