import {
  DOMAIN_DOT,
  DOMAIN_SUFFIX,
  HOST_LABEL,
  LEADING_URL_PUNCTUATION,
  NETWORK_SCHEME,
  TRAILING_URL_PUNCTUATION,
  URL_TOKEN_SEPARATORS,
} from "./patterns"

export type ModerationUrl =
  | Readonly<{ valid: true; hostname: string; pathname: string }>
  | Readonly<{ valid: false; hostname: null; pathname: string }>

function validDomain(hostname: string): boolean {
  const labels = hostname.split(".")
  const suffix = hostname.slice(hostname.lastIndexOf(".") + 1)
  return (
    hostname.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => HOST_LABEL.test(label)) &&
    DOMAIN_SUFFIX.test(suffix)
  )
}

/** Domain entries contain no scheme, port, credentials, wildcard or path. */
export function normalizeAllowedDomain(value: string): string | null {
  if (!value || /[\s/:@?#\\%*]/u.test(value)) return null
  try {
    const hostname = new URL(`https://${value}`).hostname.replace(/\.$/u, "")
    return validDomain(hostname) ? hostname : null
  } catch {
    return null
  }
}

export function isAllowedHostname(
  hostname: string,
  domains: readonly string[],
  allowSubdomains: boolean
): boolean {
  return domains.some(
    (domain) =>
      hostname === domain ||
      (allowSubdomains && hostname.endsWith(`.${domain}`))
  )
}

function parseUrl(candidate: string, explicit: boolean): ModerationUrl {
  try {
    const url = new URL(explicit ? candidate : `https://${candidate}`)
    const hostname = url.hostname.replace(/\.$/u, "")
    const valid =
      Boolean(hostname) &&
      (validDomain(hostname) ||
        // WHATWG URL validates and canonicalises explicit IPv4/IPv6 URLs.
        Boolean(
          explicit && (/^[0-9.]+$/u.test(hostname) || hostname.startsWith("["))
        ))
    return valid
      ? { valid: true, hostname, pathname: url.pathname }
      : { valid: false, hostname: null, pathname: url.pathname }
  } catch {
    return { hostname: null, pathname: "", valid: false }
  }
}

/** Syntactic validation only; no DNS lookups or network access. */
export function detectUrls(text: string): readonly ModerationUrl[] {
  const urls: ModerationUrl[] = []
  for (const token of text.split(URL_TOKEN_SEPARATORS)) {
    const scheme = NETWORK_SCHEME.exec(token)
    const candidate = scheme
      ? token.slice(scheme.index)
      : token.replace(LEADING_URL_PUNCTUATION, "")
    if (!scheme) {
      // Preserve punctuation in authorities: it can be part of URL credentials.
      const authorityEnd = candidate.search(/[/?#]/u)
      const authority =
        authorityEnd === -1 ? candidate : candidate.slice(0, authorityEnd)
      if (
        authority.includes("@") ||
        !DOMAIN_DOT.test(authority) ||
        !/[\p{L}]/u.test(authority)
      )
        continue
    }
    let url = parseUrl(candidate, Boolean(scheme))
    const unwrapped = candidate.replace(TRAILING_URL_PUNCTUATION, "")
    // A closing IPv6 bracket is part of the address, not prose punctuation.
    if (
      unwrapped !== candidate &&
      !(url.valid && url.hostname.startsWith("["))
    ) {
      url = parseUrl(unwrapped, Boolean(scheme))
    }
    urls.push(url)
  }
  return urls
}

export function isDiscordInvite(url: ModerationUrl): boolean {
  if (!url.valid) return false
  if (url.hostname === "discord.gg")
    return /^\/[A-Za-z0-9-]+/u.test(url.pathname)
  return (
    (url.hostname === "discord.com" ||
      url.hostname.endsWith(".discord.com") ||
      url.hostname === "discordapp.com") &&
    /^\/invite\/[A-Za-z0-9-]+/u.test(url.pathname)
  )
}
