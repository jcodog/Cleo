"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError } from "convex/values"

import { internal } from "../../../../_generated/api"
import type { Id } from "../../../../_generated/dataModel"
import type { ActionCtx } from "../../../../_generated/server"
import {
  getClerkDiscordAccessToken,
  getClerkUser,
} from "../../../../lib/clerkOAuth"
import {
  fetchDiscordBotGuilds,
  fetchDiscordCurrentUserGuilds,
  type DiscordBotGuildSummary,
  type DiscordManageableGuild,
} from "../../../../lib/discordRest"
import { buildRestVerifiedGuildInput } from "./restAccess"

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

type BotGuildDiscovery =
  | {
      status: "ready"
      guildsByDiscordId: Map<string, DiscordBotGuildSummary>
    }
  | {
      status: "unavailable"
      reason:
        | "discordBotTokenUnavailable"
        | "discordApiUnavailable"
        | "discordRestDeniedAccess"
    }

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
      return { status: "missingDiscordIdentity" as const }
    }
  }

  const tokenResult = await getClerkDiscordAccessToken(context.user.clerkUserId)

  if (tokenResult.status === "unavailable") {
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
    return {
      status: "discordGuildDiscoveryUnavailable" as const,
      reason: userGuildsResult.reason,
      guilds: context.guilds,
    }
  }

  const botGuildDiscovery = await getBotGuildDiscovery()

  if (botGuildDiscovery.status === "ready") {
    const verifiedAt = Date.now()

    for (const userGuild of userGuildsResult.guilds) {
      const botGuild = botGuildDiscovery.guildsByDiscordId.get(
        userGuild.discordGuildId
      )

      if (!userGuild.canManage || !botGuild) {
        continue
      }

      await ctx.runMutation(
        internal.mutations.dashboard.discord.guilds.upsertRestVerified.upsert,
        buildRestVerifiedGuildInput({
          botGuild,
          discordAccount: context.discordAccount,
          user: context.user,
          userGuild,
          verifiedAt,
        })
      )
    }

    for (const knownGuild of context.guilds) {
      if (
        knownGuild.state !== "installed" ||
        botGuildDiscovery.guildsByDiscordId.has(knownGuild.discordGuildId)
      ) {
        continue
      }

      await ctx.runMutation(
        internal.mutations.dashboard.discord.guilds.markBotMissing.mark,
        {
          discordGuildId: knownGuild.discordGuildId,
          verifiedAt,
        }
      )
    }
  }

  if (botGuildDiscovery.status === "unavailable") {
    return {
      status: "discordGuildDiscoveryUnavailable" as const,
      reason: botGuildDiscovery.reason,
      guilds: context.guilds,
    }
  }

  const knownInstalledGuildIds = new Set(
    context.guilds
      .filter((guild) => guild.state === "installed")
      .map((guild) => guild.discordGuildId)
  )

  return {
    status: "ready" as const,
    guilds: mergeInstallableGuilds({
      activeSessions: context.installSessions,
      botGuildDiscovery,
      knownGuilds: context.guilds,
      knownInstalledGuildIds,
      liveGuilds: userGuildsResult.guilds,
    }),
  }
}

function mergeInstallableGuilds({
  activeSessions,
  botGuildDiscovery,
  knownInstalledGuildIds,
  knownGuilds,
  liveGuilds,
}: {
  activeSessions: ActiveInstallSession[]
  botGuildDiscovery: BotGuildDiscovery
  knownInstalledGuildIds: Set<string>
  knownGuilds: KnownGuild[]
  liveGuilds: DiscordManageableGuild[]
}): KnownGuild[] {
  const guildsByDiscordId = new Map<string, KnownGuild>()
  const sessionsByDiscordId = new Map(
    activeSessions.map((session) => [session.discordGuildId, session])
  )
  const knownGuildsByDiscordId = new Map(
    knownGuilds.map((guild) => [guild.discordGuildId, guild])
  )

  for (const liveGuild of liveGuilds) {
    const knownGuild = knownGuildsByDiscordId.get(liveGuild.discordGuildId)
    const botGuild =
      botGuildDiscovery.status === "ready"
        ? botGuildDiscovery.guildsByDiscordId.get(liveGuild.discordGuildId)
        : undefined

    if (!liveGuild.canManage) {
      if (knownGuild !== undefined) {
        guildsByDiscordId.set(liveGuild.discordGuildId, {
          ...knownGuild,
          state: "forbidden",
          unavailableReason: "missingManageGuildPermission",
        })
      }

      continue
    }

    const session = sessionsByDiscordId.get(liveGuild.discordGuildId)
    const state = getLiveGuildState({
      botGuild,
      hasKnownInstalledRecord: knownInstalledGuildIds.has(
        liveGuild.discordGuildId
      ),
      session,
      userGuild: liveGuild,
    })

    if (state === null) {
      continue
    }

    const iconUrl = botGuild?.iconUrl ?? liveGuild.iconUrl
    const iconHash = botGuild?.iconHash ?? liveGuild.iconHash
    const memberCount = botGuild?.memberCount ?? liveGuild.memberCount
    const presenceCount = botGuild?.presenceCount ?? liveGuild.presenceCount
    const unavailableReason =
      state === "unavailable" ? ("botLeft" as const) : undefined

    guildsByDiscordId.set(liveGuild.discordGuildId, {
      discordGuildId: liveGuild.discordGuildId,
      name: botGuild?.name ?? liveGuild.name,
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
      ...(unavailableReason !== undefined ? { unavailableReason } : {}),
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

  for (const knownGuild of knownGuilds) {
    const liveGuild = guildsByDiscordId.get(knownGuild.discordGuildId)

    if (!liveGuild) {
      guildsByDiscordId.set(knownGuild.discordGuildId, {
        ...knownGuild,
        state: "forbidden",
        unavailableReason: "missingManageGuildPermission",
      })
      continue
    }

    if (liveGuild.state === "unavailable" || liveGuild.state === "forbidden") {
      guildsByDiscordId.set(knownGuild.discordGuildId, liveGuild)
      continue
    }

    guildsByDiscordId.set(knownGuild.discordGuildId, {
      ...liveGuild,
      ...(liveGuild.iconUrl === undefined && knownGuild.iconUrl !== undefined
        ? { iconUrl: knownGuild.iconUrl }
        : {}),
      ...(liveGuild.iconHash === undefined && knownGuild.iconHash !== undefined
        ? { iconHash: knownGuild.iconHash }
        : {}),
      ...(liveGuild.memberCount === undefined &&
      knownGuild.memberCount !== undefined
        ? { memberCount: knownGuild.memberCount }
        : {}),
      ...(liveGuild.presenceCount === undefined &&
      knownGuild.presenceCount !== undefined
        ? { presenceCount: knownGuild.presenceCount }
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

function getLiveGuildState({
  botGuild,
  hasKnownInstalledRecord,
  session,
  userGuild,
}: {
  botGuild: DiscordBotGuildSummary | undefined
  hasKnownInstalledRecord: boolean
  session: ActiveInstallSession | undefined
  userGuild: DiscordManageableGuild
}): KnownGuild["state"] | null {
  if (botGuild !== undefined) {
    return "installed"
  }

  if (session !== undefined && userGuild.canInstall) {
    return "pending"
  }

  if (userGuild.canInstall) {
    return "installable"
  }

  if (hasKnownInstalledRecord) {
    return "unavailable"
  }

  return null
}

async function getBotGuildDiscovery(): Promise<BotGuildDiscovery> {
  if (!discordEnv.DISCORD_BOT_TOKEN) {
    return {
      status: "unavailable",
      reason: "discordBotTokenUnavailable",
    }
  }

  const botGuildsResult = await fetchDiscordBotGuilds(
    discordEnv.DISCORD_BOT_TOKEN
  )

  if (botGuildsResult.status === "unavailable") {
    return {
      status: "unavailable",
      reason: botGuildsResult.reason,
    }
  }

  return {
    status: "ready",
    guildsByDiscordId: new Map(
      botGuildsResult.guilds.map((guild) => [guild.discordGuildId, guild])
    ),
  }
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
