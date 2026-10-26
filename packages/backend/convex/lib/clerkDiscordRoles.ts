"use node"
import { z } from "zod"
import { getClerkDiscordAccessToken, getClerkUser } from "./clerkOAuth"
import { getClerkLinkedProvider } from "./clerkProviders"
import {
  discordApplicationConfig,
  discordJson,
  DiscordCapabilityError,
} from "./communityDiscord"

export class DiscordRoleConsentRequired extends Error {}
export class DiscordRoleApplicationMismatch extends Error {}
const authorization = z.object({
  application: z.object({ id: z.string() }),
  scopes: z.array(z.string()),
  expires: z.string().datetime({ offset: true }),
  user: z.object({ id: z.string() }).optional(),
})

export async function clerkDiscordRoleToken(
  clerkUserId: string,
  discordUserId: string
) {
  const clerk = await getClerkUser(clerkUserId)
  if (clerk.status !== "ready" || clerk.user.id !== clerkUserId)
    throw new Error("Clerk verification is unavailable. Try again.")
  const accounts = (
    clerk.user.external_accounts ??
    clerk.user.externalAccounts ??
    []
  ).filter((account) => getClerkLinkedProvider(account.provider) === "discord")
  if (
    accounts.length !== 1 ||
    (accounts[0]?.provider_user_id ?? accounts[0]?.providerUserId) !==
      discordUserId
  )
    throw new Error(
      "Your linked Discord identity changed. Sync your account first."
    )
  const token = await getClerkDiscordAccessToken(clerkUserId)
  if (token.status !== "ready") {
    if (token.reason === "discordAccessTokenUnavailable")
      throw new DiscordRoleConsentRequired(
        "Reconnect Discord to grant Linked Roles permission."
      )
    throw new Error("Clerk token retrieval is unavailable. Try again.")
  }
  let value: z.infer<typeof authorization>
  try {
    value = authorization.parse(
      await discordJson("/oauth2/@me", token.accessToken)
    )
  } catch (error) {
    if (error instanceof DiscordCapabilityError && error.status === 401)
      throw new DiscordRoleConsentRequired(
        "Reconnect Discord to restore Linked Roles permission."
      )
    throw error
  }
  if (value.application.id !== discordApplicationConfig())
    throw new DiscordRoleApplicationMismatch(
      "Clerk's Discord OAuth client must match Cleo's Discord application. Contact the operator."
    )
  if (
    !value.scopes.includes("identify") ||
    !value.scopes.includes("role_connections.write") ||
    Date.parse(value.expires) <= Date.now() + 60000
  )
    throw new DiscordRoleConsentRequired(
      "Allow Discord Linked Roles for your connected account."
    )
  if (value.user?.id !== discordUserId)
    throw new Error("Discord token identity does not match your Cleo account.")
  return {
    accessToken: token.accessToken,
    expiresAt: Date.parse(value.expires),
  }
}
