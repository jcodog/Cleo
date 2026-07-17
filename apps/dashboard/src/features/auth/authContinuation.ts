import { withReturnTo } from "@/features/auth/safeRedirect"

export const SUPPORTED_MISSING_REQUIREMENTS = [
  "first_name",
  "last_name",
  "username",
  "legal_accepted",
] as const

export type SupportedMissingRequirement =
  (typeof SUPPORTED_MISSING_REQUIREMENTS)[number]

export function partitionMissingRequirements(fields: string[]): {
  supported: SupportedMissingRequirement[]
  unsupported: string[]
} {
  const supportedSet = new Set<string>(SUPPORTED_MISSING_REQUIREMENTS)

  return {
    supported: fields.filter((field): field is SupportedMissingRequirement =>
      supportedSet.has(field)
    ),
    unsupported: fields.filter((field) => !supportedSet.has(field)),
  }
}

export function getSessionTaskPath(
  taskKey: string,
  returnTo: string
): string | null {
  if (
    taskKey !== "choose-organization" &&
    taskKey !== "reset-password" &&
    taskKey !== "setup-mfa"
  ) {
    return null
  }

  return withReturnTo(`/session-tasks/${taskKey}`, returnTo)
}
