import { getSafeInternalPath, withReturnTo } from "@/features/auth/safeRedirect"

export const SIGN_IN_DEFAULT_RETURN_TO = "/dashboard"
export const SIGN_UP_DEFAULT_RETURN_TO = "/onboarding"

export const SUPPORTED_MISSING_REQUIREMENTS = [
  "first_name",
  "last_name",
  "username",
] as const

export type SupportedMissingRequirement =
  (typeof SUPPORTED_MISSING_REQUIREMENTS)[number]

export type MissingRequirementValues = {
  firstName: string
  lastName: string
  username: string
}

export type MissingRequirementFormState = {
  errorMessage: string | null
  fields: SupportedMissingRequirement[]
  unsupportedFields: string[]
  values: MissingRequirementValues
}

const EMPTY_REQUIREMENT_VALUES: MissingRequirementValues = {
  firstName: "",
  lastName: "",
  username: "",
}

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

export function createMissingRequirementFormState(
  fields: string[],
  values: MissingRequirementValues = EMPTY_REQUIREMENT_VALUES
): MissingRequirementFormState {
  const partitioned = partitionMissingRequirements(fields)

  return {
    errorMessage: null,
    fields: partitioned.supported,
    unsupportedFields: partitioned.unsupported,
    values,
  }
}

export function keepMissingRequirementValidationError(
  state: MissingRequirementFormState,
  errorMessage: string
): MissingRequirementFormState {
  return {
    ...state,
    errorMessage,
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

export function getSessionTaskReturnTo(value: string | null): string {
  return getSafeInternalPath(value) ?? "/onboarding"
}
