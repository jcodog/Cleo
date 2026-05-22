const CLERK_API_BASE_URL = "https://api.clerk.com/v1"
const CLERK_DISCORD_OAUTH_PROVIDER = "oauth_discord"

type ClerkOAuthToken = {
  token?: string
}

type ClerkOAuthTokenResponse = {
  data?: ClerkOAuthToken[]
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
  const response = await fetch(
    `${CLERK_API_BASE_URL}/users/${encodeURIComponent(
      clerkUserId
    )}/oauth_access_tokens/${provider}`,
    {
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
      },
    }
  )

  if (response.status === 404) {
    return ""
  }

  if (!response.ok) {
    return null
  }

  const json: unknown = await response.json()

  if (!isClerkOAuthTokenResponse(json)) {
    return null
  }

  return json.data?.find((entry) => entry.token)?.token ?? ""
}

function isClerkOAuthTokenResponse(
  value: unknown
): value is ClerkOAuthTokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (!("data" in value) ||
      (Array.isArray(value.data) &&
        value.data.every(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            (!("token" in entry) || typeof entry.token === "string")
        )))
  )
}
