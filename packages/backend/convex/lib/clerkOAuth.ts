import { normalizeClerkUserData, type ClerkUserData } from "./clerkUserData"

const CLERK_API_BASE_URL = "https://api.clerk.com/v1"
const FETCH_TIMEOUT_MS = 10000

type ClerkOAuthToken = {
  token?: string
}

export type ClerkDiscordAccessTokenResult =
  | {
      status: "ready"
      accessToken: string
    }
  | {
      status: "unavailable"
      reason:
        | "clerkSecretUnavailable"
        | "discordAccessTokenUnavailable"
        | "discordTokenResolutionUnavailable"
    }

export type ClerkProviderAccessTokenResult =
  | { status: "ready"; accessToken: string }
  | {
      status:
        | "secretUnavailable"
        | "providerNotLinked"
        | "tokenUnavailable"
        | "providerUnavailable"
    }

export type ClerkUserResult =
  | {
      status: "ready"
      user: ClerkUserData
    }
  | {
      status: "unavailable"
      reason: "clerkSecretUnavailable" | "clerkUserUnavailable"
    }

export async function getClerkUser(
  clerkUserId: string
): Promise<ClerkUserResult> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY

  if (!clerkSecretKey) {
    return {
      status: "unavailable",
      reason: "clerkSecretUnavailable",
    }
  }

  let response: Response

  try {
    response = await fetch(
      `${CLERK_API_BASE_URL}/users/${encodeURIComponent(clerkUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    )
  } catch {
    return {
      status: "unavailable",
      reason: "clerkUserUnavailable",
    }
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: "clerkUserUnavailable",
    }
  }

  let json: unknown

  try {
    json = await response.json()
  } catch {
    return {
      status: "unavailable",
      reason: "clerkUserUnavailable",
    }
  }

  const user = normalizeClerkUserData(json)

  if (!user) {
    return {
      status: "unavailable",
      reason: "clerkUserUnavailable",
    }
  }

  return {
    status: "ready",
    user,
  }
}

export async function getClerkDiscordAccessToken(
  clerkUserId: string
): Promise<ClerkDiscordAccessTokenResult> {
  const result = await getClerkProviderAccessToken(clerkUserId, "discord")
  if (result.status === "ready") return result
  if (result.status === "secretUnavailable") {
    return {
      status: "unavailable",
      reason: "clerkSecretUnavailable",
    }
  }

  if (result.status === "providerUnavailable") {
    return {
      status: "unavailable",
      reason: "discordTokenResolutionUnavailable",
    }
  }

  return {
    status: "unavailable",
    reason: "discordAccessTokenUnavailable",
  }
}

export function getClerkTwitchAccessToken(
  clerkUserId: string
): Promise<ClerkProviderAccessTokenResult> {
  return getClerkProviderAccessToken(clerkUserId, "twitch")
}

export async function getClerkProviderAccessToken(
  clerkUserId: string,
  provider: "discord" | "twitch"
): Promise<ClerkProviderAccessTokenResult> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return { status: "secretUnavailable" }
  return fetchClerkOAuthToken(clerkUserId, `oauth_${provider}`, secret)
}

async function fetchClerkOAuthToken(
  clerkUserId: string,
  provider: string,
  clerkSecretKey: string
): Promise<ClerkProviderAccessTokenResult> {
  let response: Response

  try {
    response = await fetch(
      `${CLERK_API_BASE_URL}/users/${encodeURIComponent(
        clerkUserId
      )}/oauth_access_tokens/${provider}`,
      {
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    )
  } catch {
    return { status: "providerUnavailable" }
  }

  if (response.status === 404) {
    return { status: "providerNotLinked" }
  }

  if (!response.ok) {
    return { status: "providerUnavailable" }
  }

  let json: unknown

  try {
    json = await response.json()
  } catch {
    return { status: "providerUnavailable" }
  }

  const tokens = getClerkOAuthTokens(json)

  if (tokens === null) {
    return { status: "providerUnavailable" }
  }

  const accessToken = tokens.find((entry) => entry.token)?.token
  return accessToken
    ? { status: "ready", accessToken }
    : { status: "tokenUnavailable" }
}

function getClerkOAuthTokens(value: unknown): ClerkOAuthToken[] | null {
  if (Array.isArray(value)) {
    return value.every(isClerkOAuthToken) ? value : null
  }

  if (typeof value === "object" && value !== null && "data" in value) {
    const data = value.data

    if (data === undefined) {
      return []
    }

    if (!Array.isArray(data)) {
      return null
    }

    return data.every(isClerkOAuthToken) ? data : null
  }

  return null
}

function isClerkOAuthToken(value: unknown): value is ClerkOAuthToken {
  return (
    typeof value === "object" &&
    value !== null &&
    (!("token" in value) || typeof value.token === "string")
  )
}
