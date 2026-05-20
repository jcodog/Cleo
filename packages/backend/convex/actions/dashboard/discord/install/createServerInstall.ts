"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
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

    if (context.status === "verificationUnavailable") {
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
        userId: context.user._id,
        discordUserId: context.discordAccount.providerAccountId,
        discordGuildId: context.discordGuildId,
        oauthState,
        expiresAt,
      }
    )

    return {
      status: "created" as const,
      discordGuildId: context.discordGuildId,
      installSessionId: session._id,
      expiresAt: session.expiresAt,
      installUrl: buildDiscordInstallUrl({
        discordApplicationId,
        discordGuildId: context.discordGuildId,
        oauthState,
      }),
    }
  },
})

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
  installUrl.searchParams.set("integration_type", GUILD_INSTALL_INTEGRATION_TYPE)
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
