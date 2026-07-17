const SAFE_ORIGIN = "https://cleo.local"

export function getSafeInternalPath(value: string | null): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
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
