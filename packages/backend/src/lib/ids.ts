export function assertNonEmptyString(value: string, label: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error(`${label} must not be empty`)
  }

  return trimmed
}

export function normalizeProviderAccountId(value: string) {
  return assertNonEmptyString(value, "Provider account ID")
}

export function normalizeDiscordId(value: string) {
  return assertNonEmptyString(value, "Discord ID")
}
