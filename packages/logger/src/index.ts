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
  "credential",
  "email",
  "jwt",
  "password",
  "refresh_token",
  "secret",
  "session",
  "token",
] as const

const REDACTED = "[redacted]"
const AUTHORIZATION_PATTERN =
  /\b(authorization\s*[:=]\s*)(["']?)(bearer\s+)?[^"'\s,;)]+\2/gi
const COOKIE_PATTERN =
  /\b(cookie|set-cookie)\s*[:=]\s*[^,\n\r]+?(?=\s+[a-z][a-z0-9+.-]*:\/\/|\s+\w+\s*[:=]|$|,)/gi
const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&](?:api[_-]?key|authorization|auth|cookie|credential|jwt|password|refresh[_-]?token|secret|session|(?:[a-z0-9]+[_-])+token|token)=)[^&#\s)]+/gi
const SENSITIVE_ASSIGNMENT_PATTERN =
  /(["']?)(api[_-]?key|authorization|auth|cookie|credential|jwt|password|refresh[_-]?token|secret|session|(?:[a-z0-9]+[_-])+token|token)\1(\s*[:=]\s*)(["']?)(?:bearer\s+)?[^"'\s,;)}[\]]+\4/gi
const URL_CREDENTIAL_PATTERN =
  /\b([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/gi
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

export function isSensitiveLogKey(key: string): boolean {
  const normalized = key.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase()

  return SENSITIVE_KEY_PARTS.some((part) =>
    normalized.includes(part.replaceAll("_", ""))
  )
}

export function redactLogMetadata<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T
}

export function redactLogText(value: string): string {
  return value
    .replaceAll(URL_CREDENTIAL_PATTERN, "$1[redacted]@")
    .replaceAll(SENSITIVE_ASSIGNMENT_PATTERN, "$1$2$1$3$4[redacted]$4")
    .replaceAll(AUTHORIZATION_PATTERN, "$1$2$3[redacted]$2")
    .replaceAll(COOKIE_PATTERN, "$1=[redacted]")
    .replaceAll(SENSITIVE_QUERY_PARAM_PATTERN, "$1[redacted]")
    .replaceAll(EMAIL_PATTERN, REDACTED)
}

export function serializeLogError(error: unknown): LogMetadata {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactLogText(error.message),
      ...(error.stack ? { stack: redactLogText(error.stack) } : {}),
      ...(error.cause !== undefined
        ? { cause: redactLogMetadata(error.cause) }
        : {}),
    }
  }

  if (error && typeof error === "object") {
    return {
      value: redactLogMetadata(error),
    }
  }

  return {
    value: redactLogText(String(error)),
  }
}

export function createLogger(namespace: string): Logger {
  return {
    debug: (message, metadata) =>
      writeLog("debug", namespace, message, metadata),
    info: (message, metadata) => writeLog("info", namespace, message, metadata),
    warn: (message, metadata) => writeLog("warn", namespace, message, metadata),
    error: (message, metadata) =>
      writeLog("error", namespace, message, metadata),
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
    message: redactLogText(message),
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
    if (typeof value === "string") {
      return redactLogText(value)
    }

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
