import { v } from "convex/values"
import { isAnnouncementKey } from "@workspace/shared/twitchEventSub"
import type { QueryCtx } from "../_generated/server"

export const dispatchDecision = v.union(
  v.object({ kind: v.literal("pending"), template: v.optional(v.string()) }),
  v.object({ kind: v.union(v.literal("ignored"), v.literal("terminal")) })
)

// The final transactional guard is shared by receipt creation and send reservation.
export async function dispatchConfig(
  ctx: QueryCtx,
  key: string,
  broadcasterId: string
) {
  if (!isAnnouncementKey(key)) return null
  const config = await ctx.db
    .query("twitchAnnouncementConfigs")
    .withIndex("by_broadcaster_key", (q) =>
      q.eq("broadcasterId", broadcasterId).eq("key", key)
    )
    .unique()
  if (!config?.enabled) return null
  const user = await ctx.db.get(config.userId)
  if (!user || user.status === "disabled") return null
  const accounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .collect()
  const discord = accounts.filter((account) => account.provider === "discord")
  const twitch = accounts.filter((account) => account.provider === "twitch")
  const current = twitch.find(
    (account) => account.providerAccountId === broadcasterId
  )
  if (discord.length !== 1 || !current) return null
  return {
    config,
    user,
    discord: discord[0]!,
    twitch: current,
    twitchAccounts: twitch,
  }
}
