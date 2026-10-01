"use node"

import { getClerkUser, getClerkTwitchAccessToken } from "./clerkOAuth"
import { getClerkLinkedProvider } from "./clerkProviders"
import type { getOwnerTwitch } from "./ownerTwitch"

type Owner = Awaited<ReturnType<typeof getOwnerTwitch>>
export type VerifiedOwnerTwitch =
  | { status: "needsLink" | "unavailable" | "stale" | "missingPermission" }
  | {
      status: "ready"
      broadcasterId: string
      login: string
      displayName: string
      avatarUrl?: string
      accessToken: string
      clientId: string
    }

export async function verifyOwnerTwitch(
  owner: Owner
): Promise<VerifiedOwnerTwitch> {
  if (owner.status !== "linked") return owner
  const clerk = await getClerkUser(owner.user.clerkUserId)
  if (clerk.status !== "ready" || clerk.user.id !== owner.user.clerkUserId)
    return { status: "unavailable" }
  const accounts = clerk.user.external_accounts ?? clerk.user.externalAccounts
  if (!accounts) return { status: "unavailable" }
  const matches = (provider: "discord" | "twitch", id: string) =>
    accounts.some(
      (account) =>
        getClerkLinkedProvider(account.provider) === provider &&
        (account.provider_user_id ?? account.providerUserId) === id
    )
  if (
    !matches("discord", owner.discord.providerAccountId) ||
    !matches("twitch", owner.twitch.providerAccountId)
  )
    return { status: "stale" }
  const token = await getClerkTwitchAccessToken(owner.user.clerkUserId)
  if (
    token.status === "providerNotLinked" ||
    token.status === "tokenUnavailable"
  )
    return { status: "stale" }
  if (token.status !== "ready") return { status: "unavailable" }
  try {
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token.accessToken}` },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    })
    if (response.status === 401 || response.status === 403)
      return { status: "stale" }
    if (!response.ok) return { status: "unavailable" }
    const value: unknown = await response.json()
    if (
      !value ||
      typeof value !== "object" ||
      !("user_id" in value) ||
      !("login" in value) ||
      !("client_id" in value) ||
      !("expires_in" in value) ||
      !("scopes" in value)
    )
      return { status: "unavailable" }
    if (
      value.user_id !== owner.twitch.providerAccountId ||
      typeof value.expires_in !== "number" ||
      value.expires_in <= 0
    )
      return { status: "stale" }
    if (
      typeof value.login !== "string" ||
      !/^[a-zA-Z0-9_]{1,25}$/.test(value.login) ||
      typeof value.client_id !== "string" ||
      !value.client_id ||
      !Array.isArray(value.scopes) ||
      !value.scopes.every((scope) => typeof scope === "string")
    )
      return { status: "unavailable" }
    if (!value.scopes.includes("channel:bot"))
      return { status: "missingPermission" }
    return {
      status: "ready",
      broadcasterId: owner.twitch.providerAccountId,
      login: value.login.toLowerCase(),
      displayName: owner.twitch.displayName ?? value.login,
      ...(owner.twitch.avatarUrl ? { avatarUrl: owner.twitch.avatarUrl } : {}),
      accessToken: token.accessToken,
      clientId: value.client_id,
    }
  } catch {
    return { status: "unavailable" }
  }
}

export function publicOwnerTwitch(source: VerifiedOwnerTwitch) {
  if (source.status !== "ready") return source
  return {
    status: source.status,
    broadcasterId: source.broadcasterId,
    login: source.login,
    displayName: source.displayName,
    ...(source.avatarUrl ? { avatarUrl: source.avatarUrl } : {}),
  }
}
