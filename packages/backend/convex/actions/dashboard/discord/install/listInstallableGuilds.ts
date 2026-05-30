"use node"

import { discordEnv } from "@workspace/env/discord"
import { ConvexError } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action, type ActionCtx } from "../../../../_generated/server"
import type { Id } from "../../../../_generated/dataModel"
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
import { dashboardDiscordInstallableGuildsResult } from "../../../../lib/validators"
import { buildRestVerifiedGuildInput } from "../lib/restAccess"

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

export const list = action({
  args: {},
  returns: dashboardDiscordInstallableGuildsResult,
  handler: async (ctx) => {
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

    const botGuildsResult = discordEnv.DISCORD_BOT_TOKEN
      ? await fetchDiscordBotGuilds(discordEnv.DISCORD_BOT_TOKEN)
      : null
    const botGuildsByDiscordId =
      botGuildsResult?.status === "ready"
        ? new Map(
            botGuildsResult.guilds.map((guild) => [
              guild.discordGuildId,
              guild,
            ])
          )
        : new Map<string, DiscordBotGuildSummary>()

    if (botGuildsResult?.status === "ready") {
      const verifiedAt = Date.now()

      for (const liveGuild of discordGuilds.guilds) {
        if (!liveGuild.canManage) {
          continue
        }

        const botGuild = botGuildsByDiscordId.get(liveGuild.discordGuildId)

        if (!botGuild) {
          continue
        }

        await ctx.runMutation(
          internal.mutations.dashboard.discord.guilds.upsertRestVerified.upsert,
          buildRestVerifiedGuildInput({
            botGuild,
            discordAccount: context.discordAccount,
            user: context.user,
            userGuild: liveGuild,
            verifiedAt,
          })
        )
      }
    }

    return {
      status: "ready" as const,
      guilds: mergeInstallableGuilds({
        botGuildsByDiscordId,
        knownGuilds: context.guilds,
        liveGuilds: discordGuilds.guilds,
        activeSessions: context.installSessions,
      }),
    }
  },
})

function mergeInstallableGuilds({
  activeSessions,
  botGuildsByDiscordId,
  knownGuilds,
  liveGuilds,
}: {
  activeSessions: ActiveInstallSession[]
  botGuildsByDiscordId: Map<string, DiscordBotGuildSummary>
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
    const botGuild = botGuildsByDiscordId.get(liveGuild.discordGuildId)

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
    const state = getLiveGuildState(session, knownGuild, botGuild)
    const iconUrl = botGuild?.iconUrl ?? liveGuild.iconUrl
    const iconHash = botGuild?.iconHash ?? liveGuild.iconHash
    const memberCount = botGuild?.memberCount ?? liveGuild.memberCount
    const presenceCount = botGuild?.presenceCount ?? liveGuild.presenceCount

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
        unavailableReason: "missingManageGuildPermission" as const,
      })
      continue
    }

    if (liveGuild.state === "unavailable" || liveGuild.state === "forbidden") {
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
      state: liveGuild.state,
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
  session: ActiveInstallSession | undefined,
  knownGuild: KnownGuild | undefined,
  botGuild: DiscordBotGuildSummary | undefined
): KnownGuild["state"] {
  if (knownGuild?.state === "installed" || botGuild !== undefined) {
    return "installed"
  }

  if (session !== undefined) {
    return "pending"
  }

  if (knownGuild?.state === "installable") {
    return "installable"
  }

  return "verificationNeeded"
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

function getClerkSyncUnavailableReason(
  reason: "clerkSecretUnavailable" | "clerkUserUnavailable"
):
  | "clerkSecretUnavailable"
  | "discordTokenResolutionUnavailable" {
  return reason === "clerkSecretUnavailable"
    ? "clerkSecretUnavailable"
    : "discordTokenResolutionUnavailable"
}
