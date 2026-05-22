"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action, type ActionCtx } from "../../../../_generated/server"
import type { Doc } from "../../../../_generated/dataModel"
import { getClerkDiscordAccessToken } from "../../../../lib/clerkOAuth"
import { fetchDiscordCurrentUserGuilds } from "../../../../lib/discordRest"
import { dashboardDiscordCreateServerInstallResult } from "../../../../lib/validators"

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize"
const DEFAULT_BOT_PERMISSIONS = "0"
const GUILD_INSTALL_INTEGRATION_TYPE = "0"
const INSTALL_SESSION_TTL_MS = 30 * 60 * 1000

export const create = action({
  args: {
    discordGuildId: v.string(),
  },
  returns: dashboardDiscordCreateServerInstallResult,
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context
        .getCreateServerInstallContext,
      { discordGuildId: args.discordGuildId }
    )

    if (context.status === "missingUser") {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    if (context.status === "missingDiscordIdentity") {
      return { status: "missingDiscordIdentity" as const }
    }

    if (context.status === "alreadyInstalled") {
      return {
        status: "alreadyInstalled" as const,
        discordGuildId: context.discordGuildId,
        targetPath: `/dashboard/${context.discordGuildId}`,
      }
    }

    const installContext =
      context.status === "ready"
        ? {
            user: context.user,
            discordAccount: context.discordAccount,
            discordGuildId: context.discordGuildId,
          }
        : await getRestVerifiedInstallContext(ctx, args.discordGuildId)

    if (!installContext) {
      return {
        status: "verificationUnavailable" as const,
        reason: "discordGuildDiscoveryUnavailable" as const,
      }
    }

    const discordApplicationId =
      discordEnv.DISCORD_APPLICATION_ID ?? discordEnv.DISCORD_CLIENT_ID

    if (!discordApplicationId) {
      return {
        status: "configUnavailable" as const,
        reason: "discordApplicationIdMissing" as const,
      }
    }

    const oauthState = createOauthState()
    const expiresAt = Date.now() + INSTALL_SESSION_TTL_MS
    const session = await ctx.runMutation(
      internal.mutations.dashboard.discord.installSessions.upsert.pending,
      {
        userId: installContext.user._id,
        discordUserId: installContext.discordAccount.providerAccountId,
        discordGuildId: installContext.discordGuildId,
        oauthState,
        expiresAt,
      }
    )

    return {
      status: "created" as const,
      discordGuildId: installContext.discordGuildId,
      installSessionId: session._id,
      expiresAt: session.expiresAt,
      installUrl: buildDiscordInstallUrl({
        discordApplicationId,
        discordGuildId: installContext.discordGuildId,
        oauthState,
      }),
    }
  },
})

async function getRestVerifiedInstallContext(
  ctx: ActionCtx,
  discordGuildId: string
): Promise<{
  user: Doc<"users">
  discordAccount: Doc<"linkedAccounts">
  discordGuildId: string
} | null> {
  const context = await ctx.runQuery(
    internal.queries.dashboard.discord.install.context
      .getInstallableGuildsContext,
    {}
  )

  if (context.status !== "ready" || !context.discordAccount) {
    return null
  }

  const tokenResult = await getClerkDiscordAccessToken(context.user.clerkUserId)

  if (tokenResult.status === "unavailable") {
    return null
  }

  const discordGuilds = await fetchDiscordCurrentUserGuilds(
    tokenResult.accessToken
  )

  if (discordGuilds.status === "unavailable") {
    return null
  }

  const guild = discordGuilds.guilds.find(
    (liveGuild) => liveGuild.discordGuildId === discordGuildId
  )

  if (!guild?.canManage) {
    return null
  }

  return {
    user: context.user,
    discordAccount: context.discordAccount,
    discordGuildId,
  }
}

function buildDiscordInstallUrl({
  discordApplicationId,
  discordGuildId,
  oauthState,
}: {
  discordApplicationId: string
  discordGuildId: string
  oauthState: string
}) {
  const installUrl = new URL(DISCORD_AUTHORIZE_URL)

  installUrl.searchParams.set("client_id", discordApplicationId)
  installUrl.searchParams.set("scope", "bot applications.commands")
  installUrl.searchParams.set(
    "permissions",
    discordEnv.DISCORD_BOT_PERMISSIONS ?? DEFAULT_BOT_PERMISSIONS
  )
  installUrl.searchParams.set("guild_id", discordGuildId)
  installUrl.searchParams.set("disable_guild_select", "true")
  installUrl.searchParams.set(
    "integration_type",
    GUILD_INSTALL_INTEGRATION_TYPE
  )
  installUrl.searchParams.set("state", oauthState)

  if (discordEnv.DISCORD_INSTALL_REDIRECT_URI) {
    installUrl.searchParams.set(
      "redirect_uri",
      discordEnv.DISCORD_INSTALL_REDIRECT_URI
    )
  }

  return installUrl.toString()
}

function createOauthState() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}
