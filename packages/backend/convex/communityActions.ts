"use node"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { v } from "convex/values"
import { action, internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { backendEnv } from "@workspace/env/backend"
import {
  discordApplicationConfig,
  discordJson,
  DiscordCapabilityError,
} from "./lib/communityDiscord"
import {
  digestIntegrationValue,
  encryptDiscordTokens,
  decryptDiscordTokens,
} from "./lib/integrationSecurity"
import { cleoRoleMetadata } from "@workspace/shared/cleoRoleEligibility"
import { refreshTicket } from "./lib/discordRefreshLifecycle"
import { prepareCommunityRefresh } from "./lib/communityRefresh"
import {
  clerkDiscordRoleToken,
  DiscordRoleConsentRequired,
  DiscordRoleApplicationMismatch,
} from "./lib/clerkDiscordRoles"

/** Connect an application-bound Clerk grant, preserving a valid existing direct grant. */
export const connectClerkLinkedRoles = action({
  args: {},
  returns: v.union(
    v.literal("ready"),
    v.literal("consentRequired"),
    v.literal("applicationMismatch")
  ),
  handler: async (ctx) => {
    const { user, discord } = await ctx.runQuery(
      internal.communityRoles.account,
      {}
    )
    let token
    try {
      token = await clerkDiscordRoleToken(
        user.clerkUserId,
        discord.providerAccountId
      )
    } catch (error) {
      if (
        error instanceof DiscordRoleConsentRequired ||
        error instanceof DiscordRoleApplicationMismatch
      ) {
        const existing = await ctx.runQuery(
          internal.discordConnections.connection,
          { userId: user._id }
        )
        if (
          existing &&
          existing.tokenSource !== "clerk" &&
          existing.revokedAt === undefined &&
          existing.discordUserId === discord.providerAccountId
        ) {
          await ctx.runAction(internal.communityActions.publishLinkedRoles, {
            userId: user._id,
          })
          const refreshed = await ctx.runQuery(
            internal.discordConnections.connection,
            { userId: user._id }
          )
          if (refreshed && refreshed.revokedAt === undefined)
            return "ready" as const
        }
      }
      if (error instanceof DiscordRoleConsentRequired)
        return "consentRequired" as const
      if (error instanceof DiscordRoleApplicationMismatch)
        return "applicationMismatch" as const
      throw error
    }
    await ctx.runMutation(internal.discordConnections.connectClerk, {
      userId: user._id,
      discordUserId: discord.providerAccountId,
      expiresAt: token.expiresAt,
    })
    await ctx.runAction(internal.communityActions.publishLinkedRoles, {
      userId: user._id,
    })
    return "ready" as const
  },
})

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
  scope: z.string(),
})
class RevokedDiscordGrant extends Error {}
/** Require the direct-grant fallback's HTTPS callback and encrypted token storage. */
function oauthConfig() {
  const clientId = discordApplicationConfig()
  const secret = backendEnv.DISCORD_CLIENT_SECRET
  const redirect = backendEnv.DISCORD_ROLE_CONNECTION_REDIRECT_URL
  if (
    !secret ||
    !redirect ||
    !backendEnv.DISCORD_TOKEN_ENCRYPTION_KEY ||
    new URL(redirect).protocol !== "https:" ||
    new URL(redirect).pathname !== "/discord/linked-role"
  )
    throw new Error("Discord Linked Roles are not configured.")
  return { clientId, secret, redirect }
}
/** Exchange direct-grant credentials for a validated Linked Roles token response. */
async function tokens(fields: Record<string, string>) {
  const config = oauthConfig()
  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.secret,
      ...fields,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })
  if (!response.ok) {
    if (
      response.status === 400 &&
      z.object({ error: z.string() }).safeParse(await response.json()).data
        ?.error === "invalid_grant"
    )
      throw new RevokedDiscordGrant("Discord authorisation revoked.")
    throw new Error("Discord authorisation could not be verified.")
  }
  const result = tokenSchema.parse(await response.json())
  if (
    !result.scope.split(" ").includes("role_connections.write") ||
    !result.scope.split(" ").includes("identify")
  )
    throw new Error("Linked Roles permissions required.")
  return result
}
/** Revoke a direct Discord grant during cleanup without exposing its refresh token. */
async function revokeGrant(refreshToken: string) {
  const config = oauthConfig()
  const response = await fetch(
    "https://discord.com/api/v10/oauth2/token/revoke",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.secret,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    }
  )
  if (!response.ok)
    throw new Error("Discord revocation unavailable. Retry disconnecting.")
}
export const installAccount = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await ctx.runQuery(internal.communityRoles.account, {})
    const url = new URL("https://discord.com/oauth2/authorize")
    url.search = new URLSearchParams({
      client_id: discordApplicationConfig(),
      integration_type: "1",
      scope: "applications.commands",
    }).toString()
    return url.href
  },
})
export const beginLinkedRoles = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const config = oauthConfig()
    const { user, discord } = await ctx.runQuery(
      internal.communityRoles.account,
      {}
    )
    const state = randomBytes(32).toString("base64url")
    await ctx.runMutation(internal.discordConnections.begin, {
      userId: user._id,
      discordUserId: discord.providerAccountId,
      purpose: "roles",
      stateHash: digestIntegrationValue(state),
    })
    const url = new URL("https://discord.com/oauth2/authorize")
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      scope: "identify role_connections.write",
      redirect_uri: config.redirect,
      state,
      prompt: "consent",
    }).toString()
    return url.href
  },
})
export const finishLinkedRoles = action({
  args: { code: v.string(), state: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !/^[\w-]{43}$/.test(args.state) ||
      !args.code ||
      args.code.length > 4096
    )
      throw new Error("Invalid Discord verification response.")
    const { user } = await ctx.runQuery(internal.communityRoles.account, {})
    const discordUserId = await ctx.runMutation(
      internal.discordConnections.consume,
      { userId: user._id, stateHash: digestIntegrationValue(args.state) }
    )
    const result = await tokens({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: oauthConfig().redirect,
    })
    const me = z
      .object({ id: z.string() })
      .parse(await discordJson("/users/@me", result.access_token))
    if (me.id !== discordUserId) {
      await revokeGrant(result.refresh_token).catch(() => undefined)
      throw new Error(
        "Connect the Discord identity linked to your Cleo account."
      )
    }
    await ctx.runMutation(internal.discordConnections.storeTokens, {
      userId: user._id,
      discordUserId,
      encryptedTokens: encryptDiscordTokens(JSON.stringify(result)),
      expiresAt: Date.now() + result.expires_in * 1000,
    })
    await ctx.runAction(internal.communityActions.publishLinkedRoles, {
      userId: user._id,
    })
    return null
  },
})
export const publishLinkedRoles = internalAction({
  args: {
    userId: v.id("users"),
    refresh: v.optional(refreshTicket),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stored = await ctx.runQuery(internal.discordConnections.connection, {
      userId: args.userId,
    })
    if (!stored || stored.revokedAt !== undefined) return null
    const account = await ctx.runQuery(internal.communityRoles.forDiscord, {
      discordUserId: stored.discordUserId,
    })
    let ticket = args.refresh
    if (account?.user._id === args.userId) {
      const snapshot = ticket
        ? await ctx.runQuery(internal.communityRoles.refreshStatus, {
            userId: args.userId,
            discordUserId: stored.discordUserId,
            ticket,
          })
        : await prepareCommunityRefresh(ctx, {
            userId: args.userId,
            discordUserId: stored.discordUserId,
            clerkUserId: account.user.clerkUserId,
          })
      if (snapshot?.state !== "complete") return null
      ticket = snapshot.ticket
    }
    const retry = async (delay: number) => {
      if ((args.attempt ?? 0) < 3)
        await ctx.scheduler.runAfter(
          delay,
          internal.communityActions.publishLinkedRoles,
          {
            userId: args.userId,
            refresh: ticket,
            attempt: (args.attempt ?? 0) + 1,
          }
        )
    }
    const connection = await ctx.runMutation(
      internal.discordConnections.lease,
      { userId: args.userId, expectedRevision: stored.revision }
    )
    if (!connection) {
      const current = await ctx.runQuery(
        internal.discordConnections.connection,
        { userId: args.userId }
      )
      if (
        current &&
        current.revokedAt === undefined &&
        current.discordUserId === stored.discordUserId
      )
        await retry(
          Math.max(
            100,
            Math.min(
              60000,
              (current.leaseUntil ?? Date.now()) - Date.now() + 100
            )
          )
        )
      return null
    }
    let revision = connection.revision
    try {
      const currentAccount = await ctx.runQuery(
        internal.communityRoles.forDiscord,
        { discordUserId: connection.discordUserId }
      )
      const clerkToken =
        connection.tokenSource === "clerk" &&
        currentAccount?.user._id === connection.userId
          ? await clerkDiscordRoleToken(
              currentAccount.user.clerkUserId,
              connection.discordUserId
            )
          : null
      let result =
        connection.tokenSource === "clerk"
          ? {
              access_token: clerkToken?.accessToken ?? "",
              refresh_token: "",
              expires_in: 0,
              scope: "identify role_connections.write",
            }
          : tokenSchema.parse(
              JSON.parse(decryptDiscordTokens(connection.encryptedTokens))
            )
      if (currentAccount?.user._id !== connection.userId) {
        if (
          connection.tokenSource !== "clerk" &&
          connection.expiresAt > Date.now()
        )
          await discordJson(
            `/users/@me/applications/${discordApplicationConfig()}/role-connection`,
            result.access_token,
            { method: "DELETE" }
          ).catch((error) => {
            if (!(
              error instanceof DiscordCapabilityError && error.status === 401
            ))
              throw error
          })
        if (connection.tokenSource !== "clerk")
          await revokeGrant(result.refresh_token)
        await ctx.runMutation(internal.discordConnections.revoke, {
          userId: args.userId,
          expectedRevision: revision,
        })
        return null
      }
      if (
        connection.tokenSource !== "clerk" &&
        connection.expiresAt < Date.now() + 60000
      ) {
        result = await tokens({
          grant_type: "refresh_token",
          refresh_token: result.refresh_token,
        })
        await ctx.runMutation(internal.discordConnections.storeTokens, {
          userId: args.userId,
          discordUserId: connection.discordUserId,
          encryptedTokens: encryptDiscordTokens(JSON.stringify(result)),
          expiresAt: Date.now() + result.expires_in * 1000,
          expectedRevision: revision,
        })
        revision++
      }
      const eligibility = await ctx.runQuery(
        internal.communityRoles.publication,
        {
          userId: args.userId,
          discordUserId: connection.discordUserId,
          ticket,
          connectionRevision: revision,
        }
      )
      if (!eligibility) return null
      const metadata = JSON.stringify(cleoRoleMetadata(eligibility))
      if (metadata === connection.publishedMetadata) return null
      await discordJson(
        `/users/@me/applications/${discordApplicationConfig()}/role-connection`,
        result.access_token,
        {
          method: "PUT",
          body: JSON.stringify({
            platform_name: "Cleo",
            metadata: JSON.parse(metadata),
          }),
        }
      )
      await ctx.runMutation(internal.discordConnections.published, {
        userId: args.userId,
        expectedRevision: revision,
        metadata,
        ticket,
      })
    } catch (error) {
      if (
        error instanceof RevokedDiscordGrant ||
        error instanceof DiscordRoleConsentRequired ||
        (error instanceof DiscordCapabilityError && error.status === 401)
      )
        await ctx.runMutation(internal.discordConnections.revoke, {
          userId: args.userId,
          expectedRevision: revision,
        })
      else {
        await retry(1000 * 2 ** (args.attempt ?? 0))
        throw error
      }
    } finally {
      await ctx.runMutation(internal.discordConnections.release, {
        userId: args.userId,
        revision,
      })
    }
    return null
  },
})
export const refreshEligibility = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { user, discord } = await ctx.runQuery(
      internal.communityRoles.account,
      {}
    )
    await prepareCommunityRefresh(
      ctx,
      {
        userId: user._id,
        discordUserId: discord.providerAccountId,
        clerkUserId: user.clerkUserId,
      },
      true
    )
    return null
  },
})
export const disconnectLinkedRoles = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { user } = await ctx.runQuery(internal.communityRoles.account, {})
    const connection = await ctx.runMutation(
      internal.discordConnections.lease,
      { userId: user._id }
    )
    if (!connection) {
      const existing = await ctx.runQuery(
        internal.discordConnections.connection,
        { userId: user._id }
      )
      if (existing && !existing.revokedAt)
        throw new Error(
          "Linked Roles are updating. Retry disconnecting in a minute."
        )
      return null
    }
    if (connection && !connection.revokedAt) {
      try {
        if (connection.tokenSource === "clerk") {
          try {
            const token = await clerkDiscordRoleToken(
              user.clerkUserId,
              connection.discordUserId
            )
            await discordJson(
              `/users/@me/applications/${discordApplicationConfig()}/role-connection`,
              token.accessToken,
              { method: "DELETE" }
            ).catch((error) => {
              if (!(
                error instanceof DiscordCapabilityError && error.status === 401
              ))
                throw error
            })
          } catch (error) {
            if (!(error instanceof DiscordRoleConsentRequired)) throw error
          } finally {
            // Local disconnect cannot depend on retaining provider consent.
            await ctx.runMutation(internal.discordConnections.revoke, {
              userId: user._id,
              expectedRevision: connection.revision,
            })
          }
          return null
        }
        const result = tokenSchema.parse(
          JSON.parse(decryptDiscordTokens(connection.encryptedTokens))
        )
        if (connection.expiresAt > Date.now())
          await discordJson(
            `/users/@me/applications/${discordApplicationConfig()}/role-connection`,
            result.access_token,
            { method: "DELETE" }
          ).catch((error) => {
            if (!(
              error instanceof DiscordCapabilityError && error.status === 401
            ))
              throw error
          })
        await revokeGrant(result.refresh_token)
        await ctx.runMutation(internal.discordConnections.revoke, {
          userId: user._id,
          expectedRevision: connection.revision,
        })
      } finally {
        await ctx.runMutation(internal.discordConnections.release, {
          userId: user._id,
          revision: connection.revision,
        })
      }
    }
    return null
  },
})
