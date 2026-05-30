const CLERK_API_BASE_URL = "https://api.clerk.com/v1"
const CLERK_DISCORD_OAUTH_PROVIDER = "oauth_discord"

type ClerkOAuthToken = {
  token?: string
}

type ClerkOAuthTokenEnvelope = {
  data?: ClerkOAuthToken[]
}

type ClerkEmailAddress = {
  id?: string
  email_address?: string
  emailAddress?: string
}

type ClerkExternalAccount = {
  id?: string | null
  provider?: string | null
  provider_user_id?: string | null
  providerUserId?: string | null
  external_account_id?: string | null
  externalAccountId?: string | null
  username?: string | null
  email_address?: string | null
  emailAddress?: string | null
  first_name?: string | null
  firstName?: string | null
  last_name?: string | null
  lastName?: string | null
  image_url?: string | null
  imageUrl?: string | null
  avatar_url?: string | null
  avatarUrl?: string | null
  approved_scopes?: string | string[] | null
  approvedScopes?: string | string[] | null
}

export type ClerkUserData = {
  id: string
  primary_email_address_id?: string | null
  primaryEmailAddressId?: string | null
  email_addresses?: ClerkEmailAddress[]
  emailAddresses?: ClerkEmailAddress[]
  external_accounts?: ClerkExternalAccount[]
  externalAccounts?: ClerkExternalAccount[]
  first_name?: string | null
  firstName?: string | null
  last_name?: string | null
  lastName?: string | null
  username?: string | null
  image_url?: string | null
  imageUrl?: string | null
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

  if (
    typeof value === "object" &&
    value !== null &&
    "data" in value
  ) {
    const envelope = value as ClerkOAuthTokenEnvelope

    if (envelope.data === undefined) {
      return []
    }

    return envelope.data.every(isClerkOAuthToken) ? envelope.data : null
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

function isClerkUserData(value: unknown): value is ClerkUserData {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    (!("primary_email_address_id" in value) ||
      typeof value.primary_email_address_id === "string" ||
      value.primary_email_address_id === null) &&
    (!("primaryEmailAddressId" in value) ||
      typeof value.primaryEmailAddressId === "string" ||
      value.primaryEmailAddressId === null) &&
    (!("email_addresses" in value) ||
      (Array.isArray(value.email_addresses) &&
        value.email_addresses.every(isClerkEmailAddress))) &&
    (!("emailAddresses" in value) ||
      (Array.isArray(value.emailAddresses) &&
        value.emailAddresses.every(isClerkEmailAddress))) &&
    (!("external_accounts" in value) ||
      (Array.isArray(value.external_accounts) &&
        value.external_accounts.every(isClerkExternalAccount))) &&
    (!("externalAccounts" in value) ||
      (Array.isArray(value.externalAccounts) &&
        value.externalAccounts.every(isClerkExternalAccount))) &&
    (!("first_name" in value) ||
      typeof value.first_name === "string" ||
      value.first_name === null) &&
    (!("firstName" in value) ||
      typeof value.firstName === "string" ||
      value.firstName === null) &&
    (!("last_name" in value) ||
      typeof value.last_name === "string" ||
      value.last_name === null) &&
    (!("lastName" in value) ||
      typeof value.lastName === "string" ||
      value.lastName === null) &&
    (!("username" in value) ||
      typeof value.username === "string" ||
      value.username === null) &&
    (!("image_url" in value) ||
      typeof value.image_url === "string" ||
      value.image_url === null) &&
    (!("imageUrl" in value) ||
      typeof value.imageUrl === "string" ||
      value.imageUrl === null)
  )
}

function isClerkEmailAddress(value: unknown): value is ClerkEmailAddress {
  return (
    typeof value === "object" &&
    value !== null &&
    (!("id" in value) || typeof value.id === "string") &&
    (!("email_address" in value) ||
      typeof value.email_address === "string") &&
    (!("emailAddress" in value) || typeof value.emailAddress === "string")
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
    (!("providerUserId" in value) ||
      typeof value.providerUserId === "string" ||
      value.providerUserId === null) &&
    (!("external_account_id" in value) ||
      typeof value.external_account_id === "string" ||
      value.external_account_id === null) &&
    (!("externalAccountId" in value) ||
      typeof value.externalAccountId === "string" ||
      value.externalAccountId === null) &&
    (!("username" in value) ||
      typeof value.username === "string" ||
      value.username === null) &&
    (!("email_address" in value) ||
      typeof value.email_address === "string" ||
      value.email_address === null) &&
    (!("emailAddress" in value) ||
      typeof value.emailAddress === "string" ||
      value.emailAddress === null) &&
    (!("first_name" in value) ||
      typeof value.first_name === "string" ||
      value.first_name === null) &&
    (!("firstName" in value) ||
      typeof value.firstName === "string" ||
      value.firstName === null) &&
    (!("last_name" in value) ||
      typeof value.last_name === "string" ||
      value.last_name === null) &&
    (!("lastName" in value) ||
      typeof value.lastName === "string" ||
      value.lastName === null) &&
    (!("image_url" in value) ||
      typeof value.image_url === "string" ||
      value.image_url === null) &&
    (!("imageUrl" in value) ||
      typeof value.imageUrl === "string" ||
      value.imageUrl === null) &&
    (!("avatar_url" in value) ||
      typeof value.avatar_url === "string" ||
      value.avatar_url === null) &&
    (!("avatarUrl" in value) ||
      typeof value.avatarUrl === "string" ||
      value.avatarUrl === null) &&
    (!("approved_scopes" in value) ||
      typeof value.approved_scopes === "string" ||
      value.approved_scopes === null ||
      (Array.isArray(value.approved_scopes) &&
        value.approved_scopes.every((scope) => typeof scope === "string"))) &&
    (!("approvedScopes" in value) ||
      typeof value.approvedScopes === "string" ||
      value.approvedScopes === null ||
      (Array.isArray(value.approvedScopes) &&
        value.approvedScopes.every((scope) => typeof scope === "string")))
  )
}
