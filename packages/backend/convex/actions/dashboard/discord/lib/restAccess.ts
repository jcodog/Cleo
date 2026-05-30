"use node"

import { discordEnv } from "@workspace/env/discord"

import type { Doc } from "../../../../_generated/dataModel"
import { getClerkDiscordAccessToken } from "../../../../lib/clerkOAuth"
import {
  fetchDiscordBotGuild,
  fetchDiscordCurrentUserGuilds,
  type DiscordBotGuildSummary,
  type DiscordManageableGuild,
} from "../../../../lib/discordRest"

type UserGuildDiscoveryUnavailableReason =
  | "clerkSecretUnavailable"
  | "discordAccessTokenUnavailable"
  | "discordTokenResolutionUnavailable"
  | "discordGuildScopeUnavailable"
  | "discordApiUnavailable"

type BotVerificationUnavailableReason =
  | "discordBotTokenUnavailable"
  | "discordApiUnavailable"
  | "discordRestDeniedAccess"

export type VerifiedManagedDiscordGuildResult =
  | {
      status: "ready"
      guild: DiscordManageableGuild
    }
  | {
      status: "unavailable"
      reason: UserGuildDiscoveryUnavailableReason
    }
  | {
      status: "forbidden"
      reason: "guildNotFoundForUser" | "missingManageGuildPermission"
    }

export type VerifiedBotGuildResult =
  | {
      status: "ready"
      guild: DiscordBotGuildSummary
    }
  | {
      status: "notInstalled"
    }
  | {
      status: "unavailable"
      reason: BotVerificationUnavailableReason
    }

export async function verifyUserCanManageDiscordGuild({
  clerkUserId,
  discordGuildId,
}: {
  clerkUserId: string
  discordGuildId: string
}): Promise<VerifiedManagedDiscordGuildResult> {
  const tokenResult = await getClerkDiscordAccessToken(clerkUserId)

  if (tokenResult.status === "unavailable") {
    return {
      status: "unavailable",
      reason: tokenResult.reason,
    }
  }

  const guildsResult = await fetchDiscordCurrentUserGuilds(
    tokenResult.accessToken
  )

  if (guildsResult.status === "unavailable") {
    return {
      status: "unavailable",
      reason: guildsResult.reason,
    }
  }

  const guild = guildsResult.guilds.find(
    (candidate) => candidate.discordGuildId === discordGuildId
  )

  if (!guild) {
    return {
      status: "forbidden",
      reason: "guildNotFoundForUser",
    }
  }

  if (!guild.canManage) {
    return {
      status: "forbidden",
      reason: "missingManageGuildPermission",
    }
  }

  return {
    status: "ready",
    guild,
  }
}

export async function verifyBotCanAccessDiscordGuild(
  discordGuildId: string
): Promise<VerifiedBotGuildResult> {
  if (!discordEnv.DISCORD_BOT_TOKEN) {
    return {
      status: "unavailable",
      reason: "discordBotTokenUnavailable",
    }
  }

  return await fetchDiscordBotGuild(
    discordGuildId,
    discordEnv.DISCORD_BOT_TOKEN
  )
}

export function buildRestVerifiedGuildInput({
  botGuild,
  discordAccount,
  user,
  userGuild,
  verifiedAt,
}: {
  botGuild: DiscordBotGuildSummary
  discordAccount: Doc<"linkedAccounts">
  user: Doc<"users">
  userGuild: DiscordManageableGuild
  verifiedAt: number
}) {
  const iconUrl = botGuild.iconUrl ?? userGuild.iconUrl
  const iconHash = botGuild.iconHash ?? userGuild.iconHash
  const memberCount = botGuild.memberCount ?? userGuild.memberCount
  const presenceCount = botGuild.presenceCount ?? userGuild.presenceCount

  return {
    discordGuildId: botGuild.discordGuildId,
    name: botGuild.name,
    ...(botGuild.description !== undefined
      ? { description: botGuild.description }
      : {}),
    ...(iconUrl !== undefined ? { iconUrl } : {}),
    ...(iconHash !== undefined ? { iconHash } : {}),
    ...(botGuild.ownerDiscordId !== undefined
      ? { ownerDiscordId: botGuild.ownerDiscordId }
      : {}),
    ...(memberCount !== undefined ? { memberCount } : {}),
    ...(presenceCount !== undefined ? { presenceCount } : {}),
    botInstallationVerifiedAt: verifiedAt,
    userId: user._id,
    discordUserId: discordAccount.providerAccountId,
    ...(userGuild.isOwner !== undefined ? { isOwner: userGuild.isOwner } : {}),
    canManage: true,
    managementVerifiedAt: verifiedAt,
    managementVerificationSource: "discord-oauth" as const,
    ...(userGuild.permissions !== undefined
      ? { permissions: userGuild.permissions }
      : {}),
    lastSyncedAt: verifiedAt,
  }
}
