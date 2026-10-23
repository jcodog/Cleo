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
  verifiedDiscordGuilds,
  DiscordCapabilityError,
} from "./lib/communityDiscord"
import {
  digestIntegrationValue,
  encryptDiscordTokens,
  decryptDiscordTokens,
} from "./lib/integrationSecurity"
import { cleoRoleMetadata } from "@workspace/shared/cleoRoleEligibility"

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
  scope: z.string(),
})
class RevokedDiscordGrant extends Error {}
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
    if (me.id !== discordUserId)
      throw new Error(
        "Connect the Discord identity linked to your Cleo account."
      )
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
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.runMutation(
      internal.discordConnections.lease,
      args
    )
    if (!connection) return null
    let revision = connection.revision
    try {
      let result = tokenSchema.parse(
        JSON.parse(decryptDiscordTokens(connection.encryptedTokens))
      )
      const account = await ctx.runQuery(internal.communityRoles.forDiscord, {
        discordUserId: connection.discordUserId,
      })
      if (account?.user._id !== connection.userId) {
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
          ...args,
          expectedRevision: revision,
        })
        return null
      }
      try {
        const guilds = await verifiedDiscordGuilds(
          account.user.clerkUserId,
          connection.discordUserId
        )
        await ctx.runMutation(internal.communityRoles.refreshGuilds, {
          userId: connection.userId,
          discordUserId: connection.discordUserId,
          guilds,
          reconciliation: true,
        })
      } catch {
        /* Membership evidence expires; failed refresh never extends eligibility. */
      }
      if (connection.expiresAt < Date.now() + 60000) {
        result = await tokens({
          grant_type: "refresh_token",
          refresh_token: result.refresh_token,
        })
        await ctx.runMutation(internal.discordConnections.storeTokens, {
          ...args,
          discordUserId: connection.discordUserId,
          encryptedTokens: encryptDiscordTokens(JSON.stringify(result)),
          expiresAt: Date.now() + result.expires_in * 1000,
          expectedRevision: revision,
        })
        revision++
      }
      const eligibility = await ctx.runQuery(
        internal.communityRoles.eligibility,
        { discordUserId: connection.discordUserId }
      )
      await discordJson(
        `/users/@me/applications/${discordApplicationConfig()}/role-connection`,
        result.access_token,
        {
          method: "PUT",
          body: JSON.stringify({
            platform_name: "Cleo",
            metadata: cleoRoleMetadata(eligibility),
          }),
        }
      )
    } catch (error) {
      if (
        error instanceof RevokedDiscordGrant ||
        (error instanceof DiscordCapabilityError && error.status === 401)
      )
        await ctx.runMutation(internal.discordConnections.revoke, {
          ...args,
          expectedRevision: revision,
        })
      else throw error
    } finally {
      await ctx.runMutation(internal.discordConnections.release, {
        ...args,
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
    const guilds = await verifiedDiscordGuilds(
      user.clerkUserId,
      discord.providerAccountId
    )
    await ctx.runMutation(internal.communityRoles.refreshGuilds, {
      userId: user._id,
      discordUserId: discord.providerAccountId,
      guilds,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.communityActions.publishLinkedRoles,
      { userId: user._id }
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
