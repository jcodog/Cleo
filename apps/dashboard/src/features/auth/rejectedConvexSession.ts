/** Recognise the structured provider rejection without treating outages as sign-in failures. */
export function isRejectedConvexSession(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.message === "Clerk did not return a Convex authentication token")
    return true
  try {
    const payload: unknown = JSON.parse(error.message)
    return (
      typeof payload === "object" &&
      payload !== null &&
      "code" in payload &&
      payload.code === "Unauthenticated"
    )
  } catch {
    return false
  }
}
