"use node"

import { createLogger } from "@workspace/logger"
import { ConvexError } from "convex/values"

import { internal } from "../../../../_generated/api"
import type { Id } from "../../../../_generated/dataModel"
import type { ActionCtx } from "../../../../_generated/server"
import {
  getClerkDiscordAccessToken,
  getClerkUser,
} from "../../../../lib/clerkOAuth"
import {
  fetchDiscordCurrentUserGuilds,
  type DiscordManageableGuild,
} from "../../../../lib/discordRest"

type KnownGuild = {
  discordGuildId: string
  name: string
  iconUrl?: string
  iconHash?: string
  memberCount?: number
  presenceCount?: number
  isOwner?: boolean
  permissions?: string
  state:
    | "installed"
    | "installable"
    | "pending"
    | "verificationNeeded"
    | "unavailable"
    | "forbidden"
  unavailableReason?:
    | "missingManageGuildPermission"
    | "botLeft"
    | "botSyncUnavailable"
    | "verificationUnavailable"
    | "discordBotTokenUnavailable"
    | "discordApiUnavailable"
    | "discordRestDeniedAccess"
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

const dashboardDiscordLog = createLogger("backend.dashboard.discord")

export async function syncDashboardGuilds(ctx: ActionCtx) {
  let context = await ctx.runQuery(
    internal.queries.dashboard.discord.install.context
      .getInstallableGuildsContext,
    {}
  )

  if (context.status === "missingUser") {
    const syncResult = await syncCurrentClerkUser(ctx)

    if (syncResult.status === "unauthorized") {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be signed in.",
      })
    }

    if (syncResult.status === "unavailable") {
      dashboardDiscordLog.warn("Clerk user sync unavailable for guild discovery.", {
        reason: syncResult.reason,
      })

      return {
        status: "discordGuildDiscoveryUnavailable" as const,
        reason: getClerkSyncUnavailableReason(syncResult.reason),
        guilds: [],
      }
    }

    context = await ctx.runQuery(
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
  }

  if (!context.discordAccount) {
    const syncResult = await syncClerkUser(ctx, context.user.clerkUserId)

    if (syncResult.status === "unavailable") {
      dashboardDiscordLog.warn(
        "Discord identity sync unavailable for guild discovery.",
        {
          reason: syncResult.reason,
          knownGuildCount: context.guilds.length,
        }
      )

      return {
        status: "discordGuildDiscoveryUnavailable" as const,
        reason: getClerkSyncUnavailableReason(syncResult.reason),
        guilds: context.guilds,
      }
    }

    context = await ctx.runQuery(
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
      dashboardDiscordLog.warn(
        "Discord identity still missing after guild discovery sync.",
        {
          knownGuildCount: context.guilds.length,
        }
      )

      return { status: "missingDiscordIdentity" as const }
    }
  }

  const tokenResult = await getClerkDiscordAccessToken(context.user.clerkUserId)

  if (tokenResult.status === "unavailable") {
    dashboardDiscordLog.warn("Discord OAuth guild discovery could not start.", {
      reason: tokenResult.reason,
      knownGuildCount: context.guilds.length,
    })

    return {
      status: "discordGuildDiscoveryUnavailable" as const,
      reason: tokenResult.reason,
      guilds: context.guilds,
    }
  }

  const userGuildsResult = await fetchDiscordCurrentUserGuilds(
    tokenResult.accessToken
  )

  if (userGuildsResult.status === "unavailable") {
    dashboardDiscordLog.warn("Discord OAuth guild discovery failed.", {
      reason: userGuildsResult.reason,
      knownGuildCount: context.guilds.length,
    })

    return {
      status: "discordGuildDiscoveryUnavailable" as const,
      reason: userGuildsResult.reason,
      guilds: context.guilds,
    }
  }

  const liveGuilds = userGuildsResult.guilds

  return {
    status: "ready" as const,
    guilds: mergeInstallableGuilds({
      activeSessions: context.installSessions,
      knownGuilds: context.guilds,
      liveGuilds,
    }),
  }
}

function mergeInstallableGuilds({
  activeSessions,
  knownGuilds,
  liveGuilds,
}: {
  activeSessions: ActiveInstallSession[]
  knownGuilds: KnownGuild[]
  liveGuilds: DiscordManageableGuild[]
}): KnownGuild[] {
  const sessionsByDiscordId = new Map(
    activeSessions.map((session) => [session.discordGuildId, session])
  )
  const knownGuildsByDiscordId = new Map(
    knownGuilds.map((guild) => [guild.discordGuildId, guild])
  )
  const guilds: KnownGuild[] = []

  // Discord's OAuth `guilds` scope is the source of truth for which servers
  // this user currently belongs to and can manage. Convex only overlays Cleo's
  // already-known installed/pending state for those live Discord guilds.
  for (const liveGuild of liveGuilds) {
    const knownGuild = knownGuildsByDiscordId.get(liveGuild.discordGuildId)
    const session = sessionsByDiscordId.get(liveGuild.discordGuildId)
    const state = getLiveGuildState({
      knownGuild,
      session,
      userGuild: liveGuild,
    })

    if (state === null) {
      continue
    }

    const iconUrl = liveGuild.iconUrl ?? knownGuild?.iconUrl
    const iconHash = liveGuild.iconHash ?? knownGuild?.iconHash
    const memberCount = liveGuild.memberCount ?? knownGuild?.memberCount
    const presenceCount = liveGuild.presenceCount ?? knownGuild?.presenceCount

    guilds.push({
      discordGuildId: liveGuild.discordGuildId,
      name: liveGuild.name,
      ...(iconUrl !== undefined ? { iconUrl } : {}),
      ...(iconHash !== undefined ? { iconHash } : {}),
      ...(memberCount !== undefined ? { memberCount } : {}),
      ...(presenceCount !== undefined ? { presenceCount } : {}),
      ...(liveGuild.isOwner !== undefined
        ? { isOwner: liveGuild.isOwner }
        : {}),
      ...(liveGuild.permissions !== undefined
        ? { permissions: liveGuild.permissions }
        : {}),
      state,
      ...(session !== undefined && state === "pending"
        ? {
            installSessionId: session._id,
            installSessionStatus: session.status,
            installSessionExpiresAt: session.expiresAt,
          }
        : {}),
      ...(state === "installed"
        ? { dashboardHref: `/dashboard/${liveGuild.discordGuildId}` }
        : {}),
    })
  }

  return guilds.sort((left, right) => {
    const stateDelta =
      getStateSortOrder(left.state) - getStateSortOrder(right.state)

    if (stateDelta !== 0) {
      return stateDelta
    }

    return left.name.localeCompare(right.name)
  })
}

function getLiveGuildState({
  knownGuild,
  session,
  userGuild,
}: {
  knownGuild: KnownGuild | undefined
  session: ActiveInstallSession | undefined
  userGuild: DiscordManageableGuild
}): KnownGuild["state"] | null {
  if (knownGuild?.state === "installed" && userGuild.canManage) {
    return "installed"
  }

  if (session !== undefined && userGuild.canInstall) {
    return "pending"
  }

  if (userGuild.canInstall) {
    return "installable"
  }

  return null
}

async function syncCurrentClerkUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    return { status: "unauthorized" as const }
  }

  return await syncClerkUser(ctx, identity.subject)
}

async function syncClerkUser(ctx: ActionCtx, clerkUserId: string) {
  const clerkUserResult = await getClerkUser(clerkUserId)

  if (clerkUserResult.status === "unavailable") {
    return clerkUserResult
  }

  await ctx.runMutation(
    internal.mutations.integrations.clerk.users.upsertFromWebhook,
    {
      data: clerkUserResult.user,
    }
  )

  return { status: "ready" as const }
}

function getClerkSyncUnavailableReason(
  reason: "clerkSecretUnavailable" | "clerkUserUnavailable"
): "clerkSecretUnavailable" | "discordTokenResolutionUnavailable" {
  return reason === "clerkSecretUnavailable"
    ? "clerkSecretUnavailable"
    : "discordTokenResolutionUnavailable"
}

function getStateSortOrder(state: KnownGuild["state"]) {
  switch (state) {
    case "installed":
      return 0
    case "pending":
      return 1
    case "verificationNeeded":
      return 2
    case "installable":
      return 3
    case "forbidden":
      return 4
    case "unavailable":
      return 5
  }
}
