const SAFE_ORIGIN = "https://cleo.local"

export function getSafeInternalPath(value: string | null): string | null {
  let decodedValue: string

  try {
    decodedValue = value ? decodeURIComponent(value) : ""
  } catch {
    return null
  }

  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    decodedValue.startsWith("//") ||
    decodedValue.includes("\\") ||
    containsControlCharacter(value) ||
    containsControlCharacter(decodedValue)
  ) {
    return null
  }

  try {
    const url = new URL(value, SAFE_ORIGIN)

    if (url.origin !== SAFE_ORIGIN) {
      return null
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function withReturnTo(pathname: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo })
  return `${pathname}?${params.toString()}`
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const characterCode = character.charCodeAt(0)

    if (characterCode <= 0x1f || characterCode === 0x7f) {
      return true
    }
  }

  return false
}
