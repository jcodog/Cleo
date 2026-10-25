"use node"
import type { ActionCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { internal } from "../_generated/api"
import { verifiedDiscordGuilds } from "./communityDiscord"
import type { RefreshLifecycle } from "./discordRefreshLifecycle"

export async function prepareCommunityRefresh(
  ctx: ActionCtx,
  account: {
    userId: Id<"users">
    discordUserId: string
    clerkUserId: string
  },
  force = false
): Promise<RefreshLifecycle> {
  const { clerkUserId, ...identity } = account
  const current = await ctx.runQuery(
    internal.communityRoles.refreshStatus,
    identity
  )
  if (current?.state === "pending") {
    // Recover a missed/failed scheduled continuation without another provider request.
    await ctx
      .runMutation(internal.communityRoles.continueGuildRefresh, current.ticket)
      .catch(() => undefined)
    return (
      (await ctx.runQuery(internal.communityRoles.refreshStatus, {
        ...identity,
        ticket: current.ticket,
      })) ?? { state: "superseded" }
    )
  }
  if (!force && current?.state === "complete") return current
  const observedAt = Date.now()
  const guilds = await verifiedDiscordGuilds(
    clerkUserId,
    identity.discordUserId
  )
  return ctx.runMutation(internal.communityRoles.refreshGuilds, {
    ...identity,
    observedAt,
    guilds,
  })
}
