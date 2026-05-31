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

  console.log(`${timestamp} ${coloredLevel} | ${message}`)
}

export function botLogError(message: string, error?: unknown): void {
  botLog(message, "error")

  if (!error) {
    return
  }

  if (error instanceof Error) {
    console.error(`${colors.red}${error.stack ?? error.message}${colors.reset}`)
    return
  }

  console.error(`${colors.red}${String(error)}${colors.reset}`)
}
