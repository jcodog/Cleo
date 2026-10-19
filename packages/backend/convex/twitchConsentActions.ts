"use node"

import { createHash, randomBytes } from "node:crypto"
import { createRemoteJWKSet, jwtVerify, customFetch } from "jose"
import { z } from "zod"
import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { action, type ActionCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { verifyOwnerTwitch } from "./lib/verifyOwnerTwitch"
import { controlPlaneConfig } from "./twitchEventSubActions"
import { chatEvidence } from "./twitchChat"

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const tokenResponse = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
})
const validationResponse = z.object({
  user_id: z.string(),
  client_id: z.string(),
  expires_in: z.number().positive(),
  scopes: z.array(z.string()),
})
const failed = () =>
  new ConvexError(
    "Twitch consent could not be verified. Check the broadcaster connection and start chatbot authorization again."
  )
function config() {
  const redirect = backendEnv.TWITCH_CHAT_OAUTH_REDIRECT_URL
  if (!redirect || backendEnv.TWITCH_CHAT_PRESENCE_ENABLED !== "true")
    throw failed()
  const url = new URL(redirect)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/twitch/chat-consent"
  )
    throw failed()
  return { ...controlPlaneConfig(), redirect }
}
async function owner(ctx: ActionCtx) {
  const account = await ctx.runQuery(internal.twitchEventSub.account, {})
  const { user, discord, twitch } = account
  if (discord.length !== 1 || twitch.length !== 1 || !discord[0] || !twitch[0])
    throw failed()
  const source = await verifyOwnerTwitch(
    {
      status: "linked",
      user,
      discord: discord[0],
      twitch: twitch[0],
      twitchAccounts: twitch,
    },
    ["channel:bot"],
    controlPlaneConfig().clientId
  )
  if (
    source.status !== "ready" ||
    source.broadcasterId === controlPlaneConfig().botId
  )
    throw failed()
  return { account, scopes: source.scopes }
}
export const begin = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const settings = config()
    const { account, scopes } = await owner(ctx)
    const context = await ctx.runQuery(internal.twitchChat.context, {
      userId: account.user._id,
    })
    if (context.evidence !== chatEvidence(account)) throw failed()
    const state = randomBytes(32).toString("base64url")
    const nonce = randomBytes(32).toString("base64url")
    await ctx.runMutation(internal.twitchConsent.begin, {
      userId: account.user._id,
      evidence: context.evidence,
      stateHash: digest(state),
      nonceHash: digest(nonce),
    })
    const url = new URL("https://id.twitch.tv/oauth2/authorize")
    url.search = new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: settings.redirect,
      response_type: "code",
      scope: [...new Set(["openid", ...scopes])].join(" "),
      force_verify: "true",
      state,
      nonce,
    }).toString()
    return url.href
  },
})
export const finish = action({
  args: { state: v.string(), code: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !/^[\w-]{43}$/.test(args.state) ||
      !args.code ||
      args.code.length > 4096
    )
      throw failed()
    const settings = config()
    const account = await ctx.runQuery(internal.twitchEventSub.account, {})
    const proof = await ctx.runMutation(internal.twitchConsent.claim, {
      userId: account.user._id,
      stateHash: digest(args.state),
    })
    try {
      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: args.code,
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: settings.redirect,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw failed()
      const tokens = tokenResponse.parse(await response.json())
      const keys = createRemoteJWKSet(
        new URL("https://id.twitch.tv/oauth2/keys"),
        {
          timeoutDuration: 10000,
          [customFetch]: (input, init) => fetch(input, init),
        }
      )
      const { payload } = await jwtVerify(tokens.id_token, keys, {
        algorithms: ["RS256"],
        issuer: "https://id.twitch.tv/oauth2",
        audience: settings.clientId,
        requiredClaims: ["sub", "iat", "exp", "nonce"],
        maxTokenAge: "10m",
        clockTolerance: 5,
      })
      if (
        payload.sub !== proof.broadcasterId ||
        payload.aud !== settings.clientId ||
        typeof payload.nonce !== "string" ||
        digest(payload.nonce) !== proof.nonceHash ||
        typeof payload.iat !== "number" ||
        payload.iat < Math.floor(proof.issuedAt / 1000) - 5
      )
        throw failed()
      const validation = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `OAuth ${tokens.access_token}` },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      })
      if (!validation.ok) throw failed()
      const grant = validationResponse.parse(await validation.json())
      if (
        grant.client_id !== proof.clientId ||
        grant.user_id !== proof.broadcasterId ||
        !grant.scopes.includes("channel:bot")
      )
        throw failed()
      const { account: current } = await owner(ctx)
      if (current.user._id !== proof.userId) throw failed()
      const context = await ctx.runQuery(internal.twitchChat.context, {
        userId: proof.userId,
      })
      if (context.evidence !== chatEvidence(current)) throw failed()
      await ctx.runMutation(internal.twitchConsent.consume, {
        consent: proof._id,
        evidence: context.evidence,
      })
    } catch {
      // Codes, provider bodies, JWTs and tokens never enter stored diagnostics or logs.
      throw failed()
    }
    return null
  },
})
