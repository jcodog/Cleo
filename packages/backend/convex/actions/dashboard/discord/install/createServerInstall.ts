"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action, type ActionCtx } from "../../../../_generated/server"
import type { Doc } from "../../../../_generated/dataModel"
import { dashboardDiscordCreateServerInstallResult } from "../../../../lib/validators"
import { verifyUserCanManageDiscordGuild } from "../lib/restAccess"

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

    const installContextResult =
      context.status === "ready"
        ? {
            status: "ready" as const,
            user: context.user,
            discordAccount: context.discordAccount,
            discordGuildId: context.discordGuildId,
          }
        : await getRestVerifiedInstallContext(ctx, args.discordGuildId)

    if (installContextResult.status === "unavailable") {
      return {
        status: "verificationUnavailable" as const,
        reason: installContextResult.reason,
      }
    }

    if (installContextResult.status === "forbidden") {
      return {
        status: "forbidden" as const,
        reason: installContextResult.reason,
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
        userId: installContextResult.user._id,
        discordUserId: installContextResult.discordAccount.providerAccountId,
        discordGuildId: installContextResult.discordGuildId,
        oauthState,
        expiresAt,
      }
    )

    return {
      status: "created" as const,
      discordGuildId: installContextResult.discordGuildId,
      installSessionId: session._id,
      expiresAt: session.expiresAt,
      installUrl: buildDiscordInstallUrl({
        discordApplicationId,
        discordGuildId: installContextResult.discordGuildId,
        oauthState,
      }),
    }
  },
})

async function getRestVerifiedInstallContext(
  ctx: ActionCtx,
  discordGuildId: string
): Promise<{
  status: "ready"
  user: Doc<"users">
  discordAccount: Doc<"linkedAccounts">
  discordGuildId: string
}
  | {
      status: "unavailable"
      reason:
        | "clerkSecretUnavailable"
        | "discordAccessTokenUnavailable"
        | "discordTokenResolutionUnavailable"
        | "discordGuildScopeUnavailable"
        | "discordApiUnavailable"
    }
  | {
      status: "forbidden"
      reason: "guildNotFoundForUser" | "missingManageGuildPermission"
    }> {
  const context = await ctx.runQuery(
    internal.queries.dashboard.discord.install.context
      .getInstallableGuildsContext,
    {}
  )

  if (context.status !== "ready" || !context.discordAccount) {
    return {
      status: "forbidden",
      reason: "guildNotFoundForUser",
    }
  }

  const userGuildResult = await verifyUserCanManageDiscordGuild({
    clerkUserId: context.user.clerkUserId,
    discordGuildId,
  })

  if (userGuildResult.status === "unavailable") {
    return userGuildResult
  }

  if (userGuildResult.status === "forbidden") {
    return userGuildResult
  }

  return {
    status: "ready",
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
