const CLERK_API_BASE_URL = "https://api.clerk.com/v1"
const CLERK_DISCORD_OAUTH_PROVIDER = "oauth_discord"

type ClerkOAuthToken = {
  token?: string
}

type ClerkOAuthTokenResponse = {
  data?: ClerkOAuthToken[]
}

type ClerkEmailAddress = {
  id: string
  email_address: string
}

type ClerkExternalAccount = {
  id?: string | null
  provider?: string | null
  provider_user_id?: string | null
  external_account_id?: string | null
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
  avatar_url?: string | null
  approved_scopes?: string | string[] | null
}

export type ClerkUserData = {
  id: string
  primary_email_address_id?: string | null
  email_addresses?: ClerkEmailAddress[]
  external_accounts?: ClerkExternalAccount[]
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  image_url?: string | null
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

  const response = await fetch(
    `${CLERK_API_BASE_URL}/users/${encodeURIComponent(clerkUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
      },
    }
  )

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: "clerkUserUnavailable",
    }
  }

  const json: unknown = await response.json()

  if (!isClerkUserData(json)) {
    return {
      status: "unavailable",
      reason: "clerkUserUnavailable",
    }
  }

  return {
    status: "ready",
    user: json,
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

function isClerkUserData(value: unknown): value is ClerkUserData {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    (!("primary_email_address_id" in value) ||
      typeof value.primary_email_address_id === "string" ||
      value.primary_email_address_id === null) &&
    (!("email_addresses" in value) ||
      (Array.isArray(value.email_addresses) &&
        value.email_addresses.every(isClerkEmailAddress))) &&
    (!("external_accounts" in value) ||
      (Array.isArray(value.external_accounts) &&
        value.external_accounts.every(isClerkExternalAccount))) &&
    (!("first_name" in value) ||
      typeof value.first_name === "string" ||
      value.first_name === null) &&
    (!("last_name" in value) ||
      typeof value.last_name === "string" ||
      value.last_name === null) &&
    (!("username" in value) ||
      typeof value.username === "string" ||
      value.username === null) &&
    (!("image_url" in value) ||
      typeof value.image_url === "string" ||
      value.image_url === null)
  )
}

function isClerkEmailAddress(value: unknown): value is ClerkEmailAddress {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "email_address" in value &&
    typeof value.email_address === "string"
  )
}

function isClerkExternalAccount(value: unknown): value is ClerkExternalAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    (!("id" in value) ||
      typeof value.id === "string" ||
      value.id === null) &&
    (!("provider" in value) ||
      typeof value.provider === "string" ||
      value.provider === null) &&
    (!("provider_user_id" in value) ||
      typeof value.provider_user_id === "string" ||
      value.provider_user_id === null) &&
    (!("external_account_id" in value) ||
      typeof value.external_account_id === "string" ||
      value.external_account_id === null) &&
    (!("username" in value) ||
      typeof value.username === "string" ||
      value.username === null) &&
    (!("first_name" in value) ||
      typeof value.first_name === "string" ||
      value.first_name === null) &&
    (!("last_name" in value) ||
      typeof value.last_name === "string" ||
      value.last_name === null) &&
    (!("image_url" in value) ||
      typeof value.image_url === "string" ||
      value.image_url === null) &&
    (!("avatar_url" in value) ||
      typeof value.avatar_url === "string" ||
      value.avatar_url === null) &&
    (!("approved_scopes" in value) ||
      typeof value.approved_scopes === "string" ||
      value.approved_scopes === null ||
      (Array.isArray(value.approved_scopes) &&
        value.approved_scopes.every((scope) => typeof scope === "string")))
  )
}
