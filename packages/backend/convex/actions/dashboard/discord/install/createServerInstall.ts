"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError, v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action, type ActionCtx } from "../../../../_generated/server"
import type { Doc } from "../../../../_generated/dataModel"
import { dashboardDiscordCreateServerInstallResult } from "../../../../lib/validators"
import {
  buildRestVerifiedGuildInput,
  verifyBotCanAccessDiscordGuild,
  verifyUserCanInstallDiscordGuild,
} from "../lib/restAccess"
import type { DiscordManageableGuild } from "../../../../lib/discordRest"

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize"
export const DEFAULT_DISCORD_BOT_PERMISSIONS = "5068182071536887"
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

    const installContextResult = await getRestVerifiedInstallContext(
      ctx,
      args.discordGuildId
    )

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

    const botGuildResult = await verifyBotCanAccessDiscordGuild(
      installContextResult.discordGuildId
    )

    if (botGuildResult.status === "unavailable") {
      return {
        status: "verificationUnavailable" as const,
        reason: botGuildResult.reason,
      }
    }

    if (botGuildResult.status === "ready") {
      await ctx.runMutation(
        internal.mutations.dashboard.discord.guilds.upsertRestVerified.upsert,
        buildRestVerifiedGuildInput({
          botGuild: botGuildResult.guild,
          discordAccount: installContextResult.discordAccount,
          user: installContextResult.user,
          userGuild: installContextResult.userGuild,
          verifiedAt: Date.now(),
        })
      )

      return {
        status: "alreadyInstalled" as const,
        discordGuildId: installContextResult.discordGuildId,
        targetPath: `/dashboard/${installContextResult.discordGuildId}`,
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

    const discordBotPermissions = resolveDiscordBotPermissions(
      discordEnv.DISCORD_BOT_PERMISSIONS
    )

    const expiresAt = Date.now() + INSTALL_SESSION_TTL_MS

    const session = await ctx.runMutation(
      internal.mutations.dashboard.discord.installSessions.upsert.pending,
      {
        userId: installContextResult.user._id,
        discordUserId: installContextResult.discordAccount.providerAccountId,
        discordGuildId: installContextResult.discordGuildId,
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
        discordBotPermissions,
        discordGuildId: installContextResult.discordGuildId,
      }),
    }
  },
})

async function getRestVerifiedInstallContext(
  ctx: ActionCtx,
  discordGuildId: string
): Promise<
  | {
      status: "ready"
      user: Doc<"users">
      discordAccount: Doc<"linkedAccounts">
      discordGuildId: string
      userGuild: DiscordManageableGuild
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
    }
> {
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

  const userGuildResult = await verifyUserCanInstallDiscordGuild({
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
    userGuild: userGuildResult.guild,
  }
}

export function buildDiscordInstallUrl({
  discordApplicationId,
  discordBotPermissions,
  discordGuildId,
}: {
  discordApplicationId: string
  discordBotPermissions: string
  discordGuildId: string
}) {
  const installUrl = new URL(DISCORD_AUTHORIZE_URL)

  installUrl.searchParams.set("client_id", discordApplicationId)
  installUrl.searchParams.set("scope", "bot applications.commands")
  installUrl.searchParams.set("permissions", discordBotPermissions)
  installUrl.searchParams.set("guild_id", discordGuildId)
  installUrl.searchParams.set("disable_guild_select", "true")
  installUrl.searchParams.set(
    "integration_type",
    GUILD_INSTALL_INTEGRATION_TYPE
  )

  return installUrl.toString()
}

export function resolveDiscordBotPermissions(
  value: string | undefined
): string {
  const normalizedValue = value?.trim()

  if (!normalizedValue || !/^\d+$/.test(normalizedValue)) {
    return DEFAULT_DISCORD_BOT_PERMISSIONS
  }

  try {
    return BigInt(normalizedValue).toString()
  } catch {
    return DEFAULT_DISCORD_BOT_PERMISSIONS
  }
}
