"use node"

import { ConvexError } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import type { Id } from "../../../../_generated/dataModel"
import { getClerkDiscordAccessToken } from "../../../../lib/clerkOAuth"
import {
  fetchDiscordCurrentUserGuilds,
  type DiscordManageableGuild,
} from "../../../../lib/discordRest"
import { dashboardDiscordInstallableGuildsResult } from "../../../../lib/validators"

type KnownGuild = {
  discordGuildId: string
  name: string
  iconUrl?: string
  iconHash?: string
  memberCount?: number
  presenceCount?: number
  isOwner?: boolean
  permissions?: string
  state: "installed" | "installable" | "pending" | "unavailable"
  unavailableReason?:
    | "missingManageGuildPermission"
    | "botLeft"
    | "botSyncUnavailable"
    | "verificationUnavailable"
  installSessionId?: Id<"discordGuildInstallSessions">
  installSessionStatus?: "pending" | "bot_joined" | "configured" | "expired"
  installSessionExpiresAt?: number
  dashboardHref?: string
}

type ActiveInstallSession = {
  _id: Id<"discordGuildInstallSessions">
  discordGuildId: string
  status: "pending" | "bot_joined" | "configured" | "expired"
  expiresAt: number
}

export const list = action({
  args: {},
  returns: dashboardDiscordInstallableGuildsResult,
  handler: async (ctx) => {
    const context = await ctx.runQuery(
      internal.queries.dashboard.discord.install.context
        .getInstallableGuildsContext,
      {}
    )

    if (context.status === "missingUser") {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    if (!context.discordAccount) {
      return { status: "missingDiscordIdentity" as const }
    }

    const tokenResult = await getClerkDiscordAccessToken(
      context.user.clerkUserId
    )

    if (tokenResult.status === "unavailable") {
      return {
        status: "discordGuildDiscoveryUnavailable" as const,
        reason: tokenResult.reason,
        guilds: context.guilds,
      }
    }

    const discordGuilds = await fetchDiscordCurrentUserGuilds(
      tokenResult.accessToken
    )

    if (discordGuilds.status === "unavailable") {
      return {
        status: "discordGuildDiscoveryUnavailable" as const,
        reason: discordGuilds.reason,
        guilds: context.guilds,
      }
    }

    return {
      status: "ready" as const,
      guilds: mergeInstallableGuilds({
        knownGuilds: context.guilds,
        liveGuilds: discordGuilds.guilds,
        activeSessions: context.installSessions,
      }),
    }
  },
})

function mergeInstallableGuilds({
  activeSessions,
  knownGuilds,
  liveGuilds,
}: {
  activeSessions: ActiveInstallSession[]
  knownGuilds: KnownGuild[]
  liveGuilds: DiscordManageableGuild[]
}): KnownGuild[] {
  const guildsByDiscordId = new Map<string, KnownGuild>()
  const sessionsByDiscordId = new Map(
    activeSessions.map((session) => [session.discordGuildId, session])
  )

  for (const liveGuild of liveGuilds) {
    const session = sessionsByDiscordId.get(liveGuild.discordGuildId)
    const state = getLiveGuildState(liveGuild, session)

    guildsByDiscordId.set(liveGuild.discordGuildId, {
      discordGuildId: liveGuild.discordGuildId,
      name: liveGuild.name,
      ...(liveGuild.iconUrl !== undefined
        ? { iconUrl: liveGuild.iconUrl }
        : {}),
      ...(liveGuild.iconHash !== undefined
        ? { iconHash: liveGuild.iconHash }
        : {}),
      ...(liveGuild.memberCount !== undefined
        ? { memberCount: liveGuild.memberCount }
        : {}),
      ...(liveGuild.presenceCount !== undefined
        ? { presenceCount: liveGuild.presenceCount }
        : {}),
      ...(liveGuild.isOwner !== undefined
        ? { isOwner: liveGuild.isOwner }
        : {}),
      ...(liveGuild.permissions !== undefined
        ? { permissions: liveGuild.permissions }
        : {}),
      state,
      ...(!liveGuild.canManage
        ? { unavailableReason: "missingManageGuildPermission" as const }
        : {}),
      ...(session !== undefined && state === "pending"
        ? {
            installSessionId: session._id,
            installSessionStatus: session.status,
            installSessionExpiresAt: session.expiresAt,
          }
        : {}),
    })
  }

  for (const knownGuild of knownGuilds) {
    const liveGuild = guildsByDiscordId.get(knownGuild.discordGuildId)

    if (!liveGuild) {
      guildsByDiscordId.set(knownGuild.discordGuildId, knownGuild)
      continue
    }

    if (liveGuild.state === "unavailable") {
      guildsByDiscordId.set(knownGuild.discordGuildId, liveGuild)
      continue
    }

    guildsByDiscordId.set(knownGuild.discordGuildId, {
      ...knownGuild,
      name: liveGuild.name,
      ...(liveGuild.iconUrl !== undefined
        ? { iconUrl: liveGuild.iconUrl }
        : {}),
      ...(liveGuild.iconHash !== undefined
        ? { iconHash: liveGuild.iconHash }
        : {}),
      ...(liveGuild.memberCount !== undefined
        ? { memberCount: liveGuild.memberCount }
        : {}),
      ...(liveGuild.presenceCount !== undefined
        ? { presenceCount: liveGuild.presenceCount }
        : {}),
      ...(liveGuild.isOwner !== undefined
        ? { isOwner: liveGuild.isOwner }
        : {}),
      ...(liveGuild.permissions !== undefined
        ? { permissions: liveGuild.permissions }
        : {}),
    })
  }

  return Array.from(guildsByDiscordId.values()).sort((left, right) => {
    const stateDelta =
      getStateSortOrder(left.state) - getStateSortOrder(right.state)

    if (stateDelta !== 0) {
      return stateDelta
    }

    return left.name.localeCompare(right.name)
  })
}

function getLiveGuildState(
  liveGuild: DiscordManageableGuild,
  session: ActiveInstallSession | undefined
): KnownGuild["state"] {
  if (!liveGuild.canManage) {
    return "unavailable"
  }

  if (session !== undefined) {
    return "pending"
  }

  return "installable"
}

function getStateSortOrder(state: KnownGuild["state"]) {
  switch (state) {
    case "installed":
      return 0
    case "pending":
      return 1
    case "installable":
      return 2
    case "unavailable":
      return 3
  }
}
