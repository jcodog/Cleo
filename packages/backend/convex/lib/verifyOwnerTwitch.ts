"use node"

import { getClerkUser, getClerkTwitchAccessToken } from "./clerkOAuth"
import { getClerkLinkedProvider } from "./clerkProviders"
import type { getOwnerTwitch } from "./ownerTwitch"
import { readTwitchControlPlaneConfig } from "./twitchControlPlaneConfig"
import { resolveBroadcasterScopes } from "@workspace/shared/twitchEventSub"

type GuildOwner = Awaited<ReturnType<typeof getOwnerTwitch>>
type Owner =
  | Exclude<GuildOwner, { status: "linked" }>
  | Omit<Extract<GuildOwner, { status: "linked" }>, "guild">
export type VerifiedOwnerTwitch =
  | {
      status:
        | "needsLink"
        | "configurationUnavailable"
        | "unavailable"
        | "stale"
        | "missingPermission"
    }
  | {
      status: "ready"
      broadcasterId: string
      login: string
      displayName: string
      avatarUrl?: string
      accessToken: string
      clientId: string
      scopes: string[]
    }

export async function verifyOwnerTwitch(
  owner: Owner,
  requiredScopes: readonly string[] = ["channel:bot"],
  expectedClientId?: string
): Promise<VerifiedOwnerTwitch> {
  if (owner.status !== "linked") return owner
  const clerk = await getClerkUser(owner.user.clerkUserId)
  if (
    clerk.status === "unavailable" &&
    clerk.reason === "clerkSecretUnavailable"
  )
    return { status: "configurationUnavailable" }
  if (clerk.status !== "ready" || clerk.user.id !== owner.user.clerkUserId)
    return { status: "unavailable" }
  const accounts = clerk.user.external_accounts ?? clerk.user.externalAccounts
  if (!accounts) return { status: "unavailable" }
  const discord = accounts.filter(
    (account) => getClerkLinkedProvider(account.provider) === "discord"
  )
  const twitchEvidence = accounts.filter(
    (account) => getClerkLinkedProvider(account.provider) === "twitch"
  )
  if (discord.length !== 1 || twitchEvidence.length > 1)
    return { status: "stale" }
  const current = twitchEvidence[0]
  const currentId = current?.provider_user_id ?? current?.providerUserId
  if (
    (discord[0]?.provider_user_id ?? discord[0]?.providerUserId) !==
      owner.discord.providerAccountId ||
    !currentId
  )
    return { status: "stale" }
  const matches = owner.twitchAccounts.filter(
    (account) => account.providerAccountId === currentId
  )
  const twitch = matches[0]
  if (matches.length === 0) return { status: "stale" }
  if (matches.length !== 1 || !twitch || !/^[1-9]\d*$/.test(currentId))
    return { status: "stale" }
  const token = await getClerkTwitchAccessToken(owner.user.clerkUserId)
  if (
    token.status === "providerNotLinked" ||
    token.status === "tokenUnavailable"
  )
    return { status: "stale" }
  if (token.status === "secretUnavailable")
    return { status: "configurationUnavailable" }
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
      typeof value.user_id !== "string" ||
      !/^[1-9]\d*$/.test(value.user_id) ||
      typeof value.expires_in !== "number" ||
      !Number.isFinite(value.expires_in) ||
      typeof value.login !== "string" ||
      !/^[a-zA-Z0-9_]{1,25}$/.test(value.login) ||
      typeof value.client_id !== "string" ||
      !value.client_id ||
      !Array.isArray(value.scopes) ||
      !value.scopes.every((scope) => typeof scope === "string")
    )
      return { status: "unavailable" }
    if (value.user_id !== twitch.providerAccountId || value.expires_in <= 0)
      return { status: "stale" }
    if (expectedClientId && value.client_id !== expectedClientId)
      return { status: "stale" }
    const scopes = value.scopes
    if (!requiredScopes.every((scope) => scopes.includes(scope)))
      return { status: "missingPermission" }
    return {
      status: "ready",
      broadcasterId: twitch.providerAccountId,
      login: value.login.toLowerCase(),
      displayName: twitch.displayName ?? value.login,
      ...(twitch.avatarUrl ? { avatarUrl: twitch.avatarUrl } : {}),
      accessToken: token.accessToken,
      clientId: value.client_id,
      scopes: value.scopes,
    }
  } catch {
    return { status: "unavailable" }
  }
}

export async function verifyLiveNotificationSource(
  owner: Owner
): Promise<VerifiedOwnerTwitch> {
  const config = readTwitchControlPlaneConfig()
  if (!config) return { status: "configurationUnavailable" }
  return verifyOwnerTwitch(
    owner,
    resolveBroadcasterScopes(["streamOnline"]),
    config.clientId
  )
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
