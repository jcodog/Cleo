import type { QueryCtx, MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"

export async function getOwnerTwitch(
  ctx: QueryCtx | MutationCtx,
  guildId: Id<"guilds">,
  owners = new Map<string, Promise<OwnerAccounts>>()
) {
  const guild = await ctx.db.get(guildId)
  if (!guild?.ownerDiscordId) return { status: "unavailable" as const }
  let pending = owners.get(guild.ownerDiscordId)
  if (!pending) {
    pending = getOwnerAccounts(ctx, guild.ownerDiscordId)
    owners.set(guild.ownerDiscordId, pending)
  }
  const account = await pending
  return account.status === "linked" ? { ...account, guild } : account
}

type OwnerAccounts = Awaited<ReturnType<typeof getOwnerAccounts>>
export function createOwnerCache() {
  return new Map<string, Promise<OwnerAccounts>>()
}

async function getOwnerAccounts(
  ctx: QueryCtx | MutationCtx,
  ownerDiscordId: string
) {
  const discordAccounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_provider_and_provider_account_id", (q) =>
      q.eq("provider", "discord").eq("providerAccountId", ownerDiscordId)
    )
    .take(2)
  if (discordAccounts.length > 1) return { status: "unavailable" as const }
  const discord = discordAccounts[0]
  if (!discord) return { status: "needsLink" as const }
  const user = await ctx.db.get(discord.userId)
  if (!user || user.status === "disabled")
    return { status: "unavailable" as const }
  const accounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_provider", (q) =>
      q.eq("userId", user._id).eq("provider", "twitch")
    )
    .take(101)
  const twitchAccounts = accounts
  if (twitchAccounts.length === 0) return { status: "needsLink" as const }
  const twitch = twitchAccounts[0]
  if (twitchAccounts.length > 100 || !twitch)
    return { status: "unavailable" as const }
  // These are candidates only. Current Clerk and OAuth evidence selects authority.
  return { status: "linked" as const, user, discord, twitch, twitchAccounts }
}

export function ownerEvidenceKey(
  owner: Extract<
    Awaited<ReturnType<typeof getOwnerTwitch>>,
    { status: "linked" }
  >
): string {
  return JSON.stringify([
    owner.user._id,
    owner.user.updatedAt,
    owner.discord._id,
    owner.discord.updatedAt,
    owner.twitchAccounts.map((account) => [
      account._id,
      account.providerAccountId,
      account.updatedAt,
    ]),
  ])
}
