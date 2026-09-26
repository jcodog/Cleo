import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

export const STAFF_DISCORD_METRICS_KEY = "discord" as const

type GuildMetricsState = Pick<
  Doc<"guilds">,
  "botLeftAt" | "memberCount" | "staffMetricsTracked"
>

export type GuildMetricsContribution = {
  guildCount: number
  memberCount: number
}

export function getTrackedGuildMetricsContribution(
  guild: GuildMetricsState | null
): GuildMetricsContribution {
  if (
    !guild ||
    guild.staffMetricsTracked !== true ||
    guild.botLeftAt !== undefined
  ) {
    return { guildCount: 0, memberCount: 0 }
  }

  return {
    guildCount: 1,
    memberCount: guild.memberCount ?? 0,
  }
}

export function getDesiredGuildMetricsContribution(
  guild: Pick<GuildMetricsState, "botLeftAt" | "memberCount"> | null
): GuildMetricsContribution {
  if (!guild || guild.botLeftAt !== undefined) {
    return { guildCount: 0, memberCount: 0 }
  }

  return {
    guildCount: 1,
    memberCount: guild.memberCount ?? 0,
  }
}

export async function applyGuildMetricsTransition(
  ctx: MutationCtx,
  before: GuildMetricsState | null,
  after: Pick<GuildMetricsState, "botLeftAt" | "memberCount"> | null,
  updatedAt: number
): Promise<void> {
  const previous = getTrackedGuildMetricsContribution(before)
  const next = getDesiredGuildMetricsContribution(after)
  const guildDelta = next.guildCount - previous.guildCount
  const memberDelta = next.memberCount - previous.memberCount

  if (guildDelta === 0 && memberDelta === 0) {
    return
  }

  const metrics = await ctx.db
    .query("staffDiscordMetrics")
    .withIndex("by_key", (q) => q.eq("key", STAFF_DISCORD_METRICS_KEY))
    .unique()

  if (!metrics) {
    await ctx.db.insert("staffDiscordMetrics", {
      key: STAFF_DISCORD_METRICS_KEY,
      activeGuildCount: Math.max(0, guildDelta),
      memberCount: Math.max(0, memberDelta),
      updatedAt,
    })
    return
  }

  await ctx.db.patch(metrics._id, {
    activeGuildCount: Math.max(0, metrics.activeGuildCount + guildDelta),
    memberCount: Math.max(0, metrics.memberCount + memberDelta),
    updatedAt,
  })
}

export async function getStaffDiscordMetrics(ctx: QueryCtx) {
  return await ctx.db
    .query("staffDiscordMetrics")
    .withIndex("by_key", (q) => q.eq("key", STAFF_DISCORD_METRICS_KEY))
    .unique()
}
