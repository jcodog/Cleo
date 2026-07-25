export function getClerkErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      longMessage?: unknown
      message?: unknown
    }

    if (typeof candidate.longMessage === "string") {
      return candidate.longMessage
    }

    if (typeof candidate.message === "string") {
      return candidate.message
    }
  }

  return "Cleo could not complete the Discord request. Please try again."
}

export async function getClerkOperationError(
  operation: () => Promise<unknown>
): Promise<string | null> {
  try {
    const result = await operation()

    if (typeof result === "object" && result !== null && "error" in result) {
      const error = (result as { error?: unknown }).error

      return error ? getClerkErrorMessage(error) : null
    }

    return null
  } catch (error: unknown) {
    return getClerkErrorMessage(error)
  }
}

export async function resetClerkAttempts(
  resetSignIn: () => Promise<unknown>,
  resetSignUp: () => Promise<unknown>
): Promise<string | null> {
  const [signInError, signUpError] = await Promise.all([
    getClerkOperationError(resetSignIn),
    getClerkOperationError(resetSignUp),
  ])

  return signInError ?? signUpError
}
