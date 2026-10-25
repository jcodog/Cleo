import { v, type Infer } from "convex/values"
import type { QueryCtx, MutationCtx } from "../_generated/server"
import {
  currentDiscordAccount,
  discordGuildRefresh,
  DISCORD_MANAGEMENT_TTL,
} from "./discordGuildMemberships"
import type { Id } from "../_generated/dataModel"

export const refreshTicket = v.object({
  id: v.id("discordGuildRefreshes"),
  revision: v.number(),
})
export const refreshLifecycle = v.union(
  v.object({ state: v.literal("superseded") }),
  v.object({
    state: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("expired")
    ),
    ticket: refreshTicket,
    observedAt: v.number(),
  })
)
export type RefreshTicket = Infer<typeof refreshTicket>
export type RefreshLifecycle = Infer<typeof refreshLifecycle>

export async function rolePublicationState(
  ctx: QueryCtx | MutationCtx,
  discordUserId: string,
  ticket?: RefreshTicket
) {
  const rows = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_provider_and_provider_account_id", (q) =>
      q.eq("provider", "discord").eq("providerAccountId", discordUserId)
    )
    .take(2)
  const candidate = rows.length === 1 ? rows[0] : undefined
  const user = candidate ? await ctx.db.get(candidate.userId) : null
  const account =
    candidate &&
    user &&
    user.status !== "disabled" &&
    (await currentDiscordAccount(ctx, user._id))?._id === candidate._id
      ? candidate
      : null
  return {
    account,
    lifecycle: account
      ? await guildRefreshLifecycle(ctx, {
          userId: account.userId,
          discordUserId,
          ticket,
        })
      : null,
  }
}

export async function guildRefreshLifecycle(
  ctx: QueryCtx | MutationCtx,
  args: {
    userId: Id<"users">
    discordUserId: string
    ticket?: RefreshTicket
  }
): Promise<RefreshLifecycle | null> {
  const row = await discordGuildRefresh(ctx, args.discordUserId)
  if (
    args.ticket &&
    (!row ||
      row._id !== args.ticket.id ||
      row.revision !== args.ticket.revision)
  )
    return { state: "superseded" }
  if (!row) return null
  const account = await currentDiscordAccount(ctx, args.userId)
  const user = await ctx.db.get(args.userId)
  const state =
    !account ||
    !user ||
    user.status === "disabled" ||
    row.userId !== args.userId ||
    row.startedAt < (account?.createdAt ?? 0) ||
    account._id !== row.linkedAccountId ||
    account.providerAccountId !== row.discordUserId
      ? "failed"
      : row.startedAt <= Date.now() - DISCORD_MANAGEMENT_TTL
        ? "expired"
        : row.state
  return {
    state,
    ticket: { id: row._id, revision: row.revision },
    observedAt: row.startedAt,
  }
}

/** Equal-time observations may remove authority, but never add it. */
export function isAuthorityReduction(
  previous: readonly { id: string; owner?: boolean; permissions?: string }[],
  incoming: typeof previous
) {
  const permissions = (value: string | undefined) => {
    try {
      return BigInt(value ?? "0") & 40n
    } catch {
      return 0n
    }
  }
  const old = new Map(previous.map((guild) => [guild.id, guild]))
  return incoming.every((guild) => {
    const before = old.get(guild.id)
    return (
      (!guild.owner || before?.owner === true) &&
      (permissions(guild.permissions) & ~permissions(before?.permissions)) ===
        0n
    )
  })
}
