import type {
  ExternalAccountResource,
  CreateExternalAccountParams,
} from "@clerk/nextjs/types"
import { getSafeInternalPath } from "../auth/safeRedirect"
import {
  resolveBroadcasterScopes,
  type EventKey,
} from "@workspace/shared/twitchEventSub"

export const TWITCH_BROADCASTER_SCOPES = resolveBroadcasterScopes([])

export function isTwitchProvider(provider: string): boolean {
  return provider === "twitch" || provider === "oauth_twitch"
}

export type TwitchLinkState =
  "notConnected" | "connected" | "missingPermission" | "reconnectRequired"
export type PublicExternalAccount = Pick<
  ExternalAccountResource,
  "approvedScopes"
> & { provider: string; verification: { status: string | null } | null }
type VerificationRedirect = {
  verification: { externalVerificationRedirectURL: URL | null } | null
}
type LinkingAccount = {
  provider: string
  approvedScopes?: string
  reauthorize: (
    params: Parameters<ExternalAccountResource["reauthorize"]>[0]
  ) => Promise<VerificationRedirect>
}
type LinkingUser = {
  externalAccounts: readonly LinkingAccount[]
  createExternalAccount: (
    params: CreateExternalAccountParams
  ) => Promise<VerificationRedirect>
}

export function getTwitchLinkState(
  accounts: readonly PublicExternalAccount[]
): TwitchLinkState {
  const account = accounts.find((entry) => isTwitchProvider(entry.provider))
  if (!account) return "notConnected"
  if (account.verification?.status !== "verified") return "reconnectRequired"
  return account.approvedScopes.split(/\s+/).includes("channel:bot")
    ? "connected"
    : "missingPermission"
}

export async function beginTwitchLink(
  user: LinkingUser,
  origin: string,
  desiredEvents: readonly EventKey[] = []
): Promise<string> {
  const callback = new URL("/twitch/link-callback?returnTo=%2Ftwitch", origin)
    .href
  const existing = user.externalAccounts.find((account) =>
    isTwitchProvider(account.provider)
  )
  const params = {
    additionalScopes: [
      ...new Set([
        ...resolveBroadcasterScopes(desiredEvents),
        ...(existing?.approvedScopes?.split(/\s+/).filter(Boolean) ?? []),
      ]),
    ],
    redirectUrl: callback,
  }
  const account = existing
    ? await existing.reauthorize(params)
    : await user.createExternalAccount({ ...params, strategy: "oauth_twitch" })
  const redirect = account.verification?.externalVerificationRedirectURL
  if (!redirect || redirect.protocol !== "https:")
    throw new Error("Twitch did not return a secure authorization URL.")
  return redirect.href
}

export function twitchReturnPath(value: string | null): string {
  const safe = getSafeInternalPath(value)
  return safe && !safe.startsWith("/twitch/link-callback") ? safe : "/twitch"
}

export function twitchProviderError(code: string | null): string | null {
  if (!code) return null
  return code === "access_denied" ||
    code.includes("cancel") ||
    code.includes("denied")
    ? "Twitch connection was cancelled. You can try again."
    : "Twitch is unavailable or could not complete the connection. Try again."
}
