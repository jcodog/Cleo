import type {
  ExternalAccountResource,
  CreateExternalAccountParams,
} from "@clerk/nextjs/types"
import { getSafeInternalPath } from "../auth/safeRedirect"

export const TWITCH_BROADCASTER_SCOPES = ["channel:bot"]

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
  const account = accounts.find(
    (entry) => entry.provider === "twitch" || entry.provider === "oauth_twitch"
  )
  if (!account) return "notConnected"
  if (account.verification?.status !== "verified") return "reconnectRequired"
  return account.approvedScopes.split(/\s+/).includes("channel:bot")
    ? "connected"
    : "missingPermission"
}

export async function beginTwitchLink(
  user: LinkingUser,
  origin: string
): Promise<string> {
  const callback = new URL("/twitch/link-callback?returnTo=%2Ftwitch", origin)
    .href
  const existing = user.externalAccounts.find(
    (account) =>
      account.provider === "twitch" || account.provider === "oauth_twitch"
  )
  const params = {
    additionalScopes: [...TWITCH_BROADCASTER_SCOPES],
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
