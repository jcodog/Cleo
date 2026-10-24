import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx, MutationCtx } from "../_generated/server"

export const DISCORD_MANAGEMENT_TTL = 300000

export async function currentDiscordAccount(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
) {
  const accounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_provider", (q) =>
      q.eq("userId", userId).eq("provider", "discord")
    )
    .take(2)
  return accounts.length === 1 ? accounts[0]! : null
}

export async function discordGuildRefresh(
  ctx: QueryCtx | MutationCtx,
  discordUserId: string
) {
  return ctx.db
    .query("discordGuildRefreshes")
    .withIndex("by_discord_user", (q) => q.eq("discordUserId", discordUserId))
    .unique()
}

export function isFreshDiscordMembership(
  membership: Doc<"discordGuildMemberships">,
  account: Doc<"linkedAccounts">,
  refresh: Doc<"discordGuildRefreshes"> | null,
  now: number
) {
  const verifiedAt = membership.managementVerifiedAt ?? 0
  return (
    membership.discordUserId === account.providerAccountId &&
    (membership.userId === undefined || membership.userId === account.userId) &&
    membership.revokedAt === undefined &&
    verifiedAt > now - DISCORD_MANAGEMENT_TTL &&
    verifiedAt <= now &&
    (!refresh ||
      (refresh.state === "complete" &&
        refresh.linkedAccountId === account._id) ||
      verifiedAt > refresh.startedAt)
  )
}

export async function freshManageableMemberships(
  ctx: QueryCtx | MutationCtx,
  account: Doc<"linkedAccounts">
) {
  const now = Date.now()
  const refresh = await discordGuildRefresh(ctx, account.providerAccountId)
  const memberships = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_discord_management", (q) =>
      q
        .eq("discordUserId", account.providerAccountId)
        .eq("canManage", true)
        .gt("managementVerifiedAt", now - DISCORD_MANAGEMENT_TTL)
    )
    .take(1000)
  return memberships.filter((membership) =>
    isFreshDiscordMembership(membership, account, refresh, now)
  )
}

export function shouldReplaceMembership({
  existing,
  incoming,
  incomingIsDirect,
  userId,
}: {
  existing: Doc<"discordGuildMemberships">
  incoming: Doc<"discordGuildMemberships">
  incomingIsDirect: boolean
  userId: Id<"users">
}): boolean {
  const existingIsDirect = existing.userId === userId

  if (incomingIsDirect && !existingIsDirect) {
    return true
  }

  if (!incomingIsDirect && existingIsDirect) {
    return false
  }

  return getMembershipFreshness(incoming) > getMembershipFreshness(existing)
}

export function getMembershipFreshness(
  membership: Doc<"discordGuildMemberships">
): number {
  return membership.managementVerifiedAt ?? membership.lastSyncedAt ?? 0
}
