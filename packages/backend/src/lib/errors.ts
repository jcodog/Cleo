export class CleoBackendError extends Error {
  readonly code: string
  readonly cause?: unknown

  constructor(message: string, options: { code: string; cause?: unknown }) {
    super(message)

    this.name = "CleoBackendError"
    this.code = options.code
    this.cause = options.cause
  }
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error"
}

export function toErrorStack(error: unknown) {
  if (error instanceof Error) {
    return error.stack
  }

  return undefined
}
