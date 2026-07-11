import {
  normalizeClerkUserData,
  type ClerkUserData,
} from "./clerkUserData"

const CLERK_API_BASE_URL = "https://api.clerk.com/v1"
const CLERK_DISCORD_OAUTH_PROVIDER = "oauth_discord"
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
  const clerkSecretKey = process.env.CLERK_SECRET_KEY

  if (!clerkSecretKey) {
    return {
      status: "unavailable",
      reason: "clerkSecretUnavailable",
    }
  }

  const token = await fetchClerkOAuthToken(
    clerkUserId,
    CLERK_DISCORD_OAUTH_PROVIDER,
    clerkSecretKey
  )

  if (token === null) {
    return {
      status: "unavailable",
      reason: "discordTokenResolutionUnavailable",
    }
  }

  if (token === "") {
    return {
      status: "unavailable",
      reason: "discordAccessTokenUnavailable",
    }
  }

  return {
    status: "ready",
    accessToken: token,
  }
}

async function fetchClerkOAuthToken(
  clerkUserId: string,
  provider: string,
  clerkSecretKey: string
): Promise<string | null> {
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
    return null
  }

  if (response.status === 404) {
    return ""
  }

  if (!response.ok) {
    return null
  }

  let json: unknown

  try {
    json = await response.json()
  } catch {
    return null
  }

  const tokens = getClerkOAuthTokens(json)

  if (tokens === null) {
    return null
  }

  return tokens.find((entry) => entry.token)?.token ?? ""
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
