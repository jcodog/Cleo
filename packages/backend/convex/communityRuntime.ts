"use node"
import { v } from "convex/values"
import { action } from "./_generated/server"
import { internal } from "./_generated/api"
import { assertValidBotSecret } from "./actions/bot/discord/lib/auth"
import { backendEnv } from "@workspace/env/backend"
import { verifiedDiscordGuilds } from "./lib/communityDiscord"
import { roleJob } from "./communityRoles"

export const claimJobs = action({
  args: { secret: v.string(), worker: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      guildId: v.string(),
      roleIdsJSON: v.string(),
      jobs: v.array(roleJob),
    })
  ),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    if (
      backendEnv.CLEO_COMMUNITY_ROLES_ENABLED !== "true" ||
      !backendEnv.CLEO_OFFICIAL_GUILD_ID ||
      !backendEnv.CLEO_MANAGED_ROLE_IDS
    )
      return null
    const jobs = await ctx.runMutation(internal.communityRoles.claim, {
      worker: args.worker,
    })
    await Promise.all(
      jobs.map(async (job) => {
        const account = await ctx.runQuery(internal.communityRoles.forDiscord, {
          discordUserId: job.discordUserId,
        })
        if (account) {
          try {
            const guilds = await verifiedDiscordGuilds(
              account.user.clerkUserId,
              job.discordUserId
            )
            await ctx.runMutation(internal.communityRoles.refreshGuilds, {
              userId: account.user._id,
              discordUserId: job.discordUserId,
              guilds,
              reconciliation: true,
            })
          } catch {
            /* Old evidence expires; outages do not confer continuing authority. */
          }
        }
      })
    )
    const ready = await ctx.runMutation(internal.communityRoles.dispatch, {
      worker: args.worker,
      jobs: jobs.map(({ id, revision }) => ({ id, revision })),
    })
    return {
      guildId: backendEnv.CLEO_OFFICIAL_GUILD_ID,
      roleIdsJSON: backendEnv.CLEO_MANAGED_ROLE_IDS,
      jobs: ready,
    }
  },
})
export const settleJob = action({
  args: {
    secret: v.string(),
    worker: v.string(),
    id: v.id("communityRoleJobs"),
    revision: v.number(),
    success: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertValidBotSecret(secret)
    return ctx.runMutation(internal.communityRoles.settle, args)
  },
})
export const installationInteraction = action({
  args: {
    secret: v.string(),
    discordUserId: v.string(),
    interactionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertValidBotSecret(secret)
    if (
      !/^\d{17,20}$/.test(args.discordUserId) ||
      !/^\d{17,20}$/.test(args.interactionId)
    )
      throw new Error("Invalid Discord interaction identity.")
    await ctx.runMutation(internal.discordConnections.installation, {
      discordUserId: args.discordUserId,
      state: "active",
      evidenceAt: Date.now(),
      eventKey: `interaction:${args.interactionId}`,
    })
    return null
  },
})
export const enqueue = action({
  args: { secret: v.string(), discordUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertValidBotSecret(secret)
    if (!/^\d{17,20}$/.test(args.discordUserId))
      throw new Error("Invalid Discord user.")
    return ctx.runMutation(internal.communityRoles.enqueue, args)
  },
})
