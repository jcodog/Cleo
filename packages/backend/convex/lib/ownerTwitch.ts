import type { QueryCtx, MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"

export async function getOwnerTwitch(
  ctx: QueryCtx | MutationCtx,
  guildId: Id<"guilds">
) {
  const guild = await ctx.db.get(guildId)
  if (!guild?.ownerDiscordId) return { status: "unavailable" as const }
  const ownerDiscordId = guild.ownerDiscordId
  const discord = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_provider_and_provider_account_id", (q) =>
      q.eq("provider", "discord").eq("providerAccountId", ownerDiscordId)
    )
    .unique()
  if (!discord) return { status: "needsLink" as const }
  const user = await ctx.db.get(discord.userId)
  if (!user || user.status === "disabled")
    return { status: "unavailable" as const }
  const accounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .collect()
  const twitchAccounts = accounts.filter(
    (account) => account.provider === "twitch"
  )
  if (twitchAccounts.length === 0) return { status: "needsLink" as const }
  const twitch = twitchAccounts[0]
  if (
    twitchAccounts.length !== 1 ||
    !twitch ||
    !/^[1-9]\d*$/.test(twitch.providerAccountId)
  )
    return { status: "unavailable" as const }
  return { status: "linked" as const, guild, user, discord, twitch }
}
