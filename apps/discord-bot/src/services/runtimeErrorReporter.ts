import {
  convexBotClient,
  type DiscordBotRuntimeErrorReport,
  type DiscordBotRuntimeErrorReportMetadata,
  type DiscordBotRuntimeErrorReportResult,
  type DiscordBotRuntimeErrorServiceArea,
  type DiscordBotRuntimeErrorSeverity,
} from "@/services/convexBotClient"
import { botLogError } from "@/utils/botLog"
import {
  redactLogMetadata,
  redactLogText,
  serializeLogError,
  type LogMetadata,
} from "@workspace/logger"

export type DiscordRuntimeErrorReporter = (
  input: DiscordRuntimeErrorReportInput
) => Promise<DiscordBotRuntimeErrorReportResult | null>

export type DiscordRuntimeErrorReportInput = {
  severity: DiscordBotRuntimeErrorSeverity
  serviceArea: DiscordBotRuntimeErrorServiceArea
  message?: string
  error?: unknown
  stack?: string
  discordGuildId?: string
  commandName?: string
  eventName?: string
  operation?: string
  fingerprint?: string
  metadata?: LogMetadata
  occurredAt?: number
}

type RuntimeErrorReporterOptions = {
  sendReport?: (
    report: DiscordBotRuntimeErrorReport
  ) => Promise<DiscordBotRuntimeErrorReportResult | null>
  logError?: typeof botLogError
}

const DEFAULT_RUNTIME_ERROR_MESSAGE = "Discord bot runtime error reported."

export async function reportDiscordRuntimeError(
  input: DiscordRuntimeErrorReportInput,
  options: RuntimeErrorReporterOptions = {}
): Promise<DiscordBotRuntimeErrorReportResult | null> {
  const sendReport = options.sendReport ?? convexBotClient.reportRuntimeError
  const logError = options.logError ?? botLogError

  try {
    const report = buildDiscordRuntimeErrorReport(input)
    return await sendReport(report)
  } catch (error) {
    logError("Discord runtime error reporting failed.", error, {
      originalServiceArea: input.serviceArea,
      originalSeverity: input.severity,
      originalOperation: input.operation,
      originalDiscordGuildId: input.discordGuildId,
    })
    return null
  }
}

export function buildDiscordRuntimeErrorReport(
  input: DiscordRuntimeErrorReportInput
): DiscordBotRuntimeErrorReport {
  const serializedError = input.error
    ? serializeLogError(input.error)
    : undefined

  const message = getRuntimeErrorMessage(input, serializedError)
  const stack = getRuntimeErrorStack(input, serializedError)
  const metadata = buildRuntimeErrorMetadata(input, serializedError)

  return {
    severity: input.severity,
    serviceArea: input.serviceArea,
    message,
    stack,
    discordGuildId: normaliseOptionalText(input.discordGuildId),
    commandName: normaliseOptionalText(input.commandName),
    eventName: normaliseOptionalText(input.eventName),
    operation: normaliseOptionalText(input.operation),
    fingerprint: normaliseOptionalText(input.fingerprint),
    metadata,
    occurredAt: input.occurredAt,
  }
}

function getRuntimeErrorMessage(
  input: DiscordRuntimeErrorReportInput,
  serializedError: LogMetadata | undefined
): string {
  const explicitMessage = normaliseOptionalText(input.message)

  if (explicitMessage) {
    return explicitMessage
  }

  const errorMessage =
    serializedError && typeof serializedError.message === "string"
      ? normaliseOptionalText(serializedError.message)
      : undefined

  return errorMessage ?? DEFAULT_RUNTIME_ERROR_MESSAGE
}

function getRuntimeErrorStack(
  input: DiscordRuntimeErrorReportInput,
  serializedError: LogMetadata | undefined
): string | undefined {
  const explicitStack = normaliseOptionalText(input.stack)

  if (explicitStack) {
    return explicitStack
  }

  if (serializedError && typeof serializedError.stack === "string") {
    return normaliseOptionalText(serializedError.stack)
  }

  return undefined
}

function buildRuntimeErrorMetadata(
  input: DiscordRuntimeErrorReportInput,
  serializedError: LogMetadata | undefined
): DiscordBotRuntimeErrorReportMetadata {
  const metadata = {
    ...(input.metadata ?? {}),
    ...(serializedError ? { error: serializedError } : {}),
  }

  return toReportMetadataOrFallback(redactLogMetadata(metadata))
}

function toReportMetadataOrFallback(
  value: unknown
): DiscordBotRuntimeErrorReportMetadata {
  try {
    const encoded = JSON.stringify(value)

    if (!encoded) {
      return undefined
    }

    return JSON.parse(encoded) as DiscordBotRuntimeErrorReportMetadata
  } catch {
    return {
      serializationError: "Runtime error metadata could not be serialized.",
    } as DiscordBotRuntimeErrorReportMetadata
  }
}

function normaliseOptionalText(value: string | undefined): string | undefined {
  const normalised = value?.trim()

  if (!normalised) {
    return undefined
  }

  return redactLogText(normalised)
}
