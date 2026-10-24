import { resolveCleoRoleEligibility } from "@workspace/shared/cleoRoleEligibility"
import { backendEnv } from "@workspace/env/backend"
import type { QueryCtx, MutationCtx } from "../_generated/server"
import { getGuildAccess } from "./guildEntitlements"
import { chatRevoked } from "./twitchRevocation"
import {
  currentDiscordAccount,
  discordGuildRefresh,
  isFreshDiscordMembership,
} from "./discordGuildMemberships"

export async function roleEligibility(
  ctx: QueryCtx | MutationCtx,
  discordUserId: string
) {
  const accounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_provider_and_provider_account_id", (q) =>
      q.eq("provider", "discord").eq("providerAccountId", discordUserId)
    )
    .take(2)
  let account = accounts.length === 1 ? accounts[0] : undefined
  if (
    account &&
    (await currentDiscordAccount(ctx, account.userId))?._id !== account._id
  )
    account = undefined
  const user = account ? await ctx.db.get(account.userId) : null
  const now = Date.now()
  const refresh = await discordGuildRefresh(ctx, discordUserId)
  const memberships = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_discord_user_id", (q) =>
      q.eq("discordUserId", discordUserId)
    )
    .take(101)
  const communities = []
  for (const membership of memberships.slice(0, 100)) {
    const guild = await ctx.db.get(membership.guildId)
    if (!guild || guild.discordGuildId === backendEnv.CLEO_OFFICIAL_GUILD_ID)
      continue
    let administrator = false
    try {
      administrator = (BigInt(membership.permissions ?? "0") & 8n) !== 0n
    } catch {
      /* Unparseable permissions never grant eligibility. */
    }
    const owner =
      guild.ownerDiscordId === discordUserId && membership.isOwner === true
    const installed =
      guild.botLeftAt === undefined &&
      guild.botInstallationVerifiedAt !== undefined &&
      membership.revokedAt === undefined
    const fresh =
      !!account &&
      isFreshDiscordMembership(membership, account, refresh, now) &&
      memberships.length <= 100
    const premium =
      installed &&
      fresh &&
      (owner || administrator) &&
      (await getGuildAccess(ctx, guild, now, { includeRevoked: false }))
        .capabilities.length > 0
    communities.push({
      id: guild.discordGuildId,
      owner,
      administrator,
      installed,
      verifiedAt: fresh ? (membership.managementVerifiedAt ?? 0) : 0,
      premium,
    })
    if (
      communities.some((c) => c.owner && c.premium) &&
      communities.some((c) => !c.owner && c.administrator && c.premium)
    )
      break
  }
  const installation = await ctx.db
    .query("discordUserInstallations")
    .withIndex("by_discord_user", (q) => q.eq("discordUserId", discordUserId))
    .unique()
  let twitchActive = false
  let paidSupporter = false
  if (user && user.status !== "disabled") {
    const twitch = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "twitch")
      )
      .take(2)
    const consumer = await ctx.db
      .query("twitchEventConsumers")
      .withIndex("by_consumer", (q) => q.eq("consumer", `chat:${user._id}`))
      .first()
    const subscription = consumer
      ? await ctx.db.get(consumer.subscription)
      : null
    const runtime = await ctx.db
      .query("twitchBotRuntime")
      .withIndex("by_key", (q) => q.eq("key", "chat-v1"))
      .unique()
    twitchActive =
      twitch.length === 1 &&
      !!subscription &&
      subscription.status === "ready" &&
      !chatRevoked(subscription) &&
      subscription.broadcasterId === twitch[0]?.providerAccountId &&
      !!runtime &&
      runtime.updatedAt > now - 90000
    const paid = await ctx.db
      .query("paidCommunityActivations")
      .withIndex("by_user_recognition", (q) =>
        q
          .eq("userId", user._id)
          .eq("discordUserId", discordUserId)
          .eq("revoked", false)
          .eq("testMode", false)
          .eq("displayRole", true)
          .gt("paidUntil", now)
      )
      .take(100)
    for (const activation of paid) {
      if (
        activation.discordUserId !== discordUserId ||
        !activation.displayRole ||
        activation.revoked ||
        activation.testMode ||
        activation.paidUntil <= now
      )
        continue
      const guild = await ctx.db.get(activation.guildId)
      if (
        guild &&
        guild.discordGuildId !== backendEnv.CLEO_OFFICIAL_GUILD_ID &&
        guild.botLeftAt === undefined &&
        (await getGuildAccess(ctx, guild)).capabilities.length > 0
      ) {
        paidSupporter = true
        break
      }
    }
  }
  return resolveCleoRoleEligibility({
    now,
    verifiedAccount: !!account && !!user && user.status !== "disabled",
    officialGuildId: backendEnv.CLEO_OFFICIAL_GUILD_ID,
    communities,
    installation: installation ?? undefined,
    twitchActive,
    paidSupporter,
  })
}
export async function queueRoleSync(
  ctx: MutationCtx,
  discordUserId: string,
  periodic = false
) {
  const current = await ctx.db
    .query("communityRoleJobs")
    .withIndex("by_user", (q) => q.eq("discordUserId", discordUserId))
    .unique()
  if (current && periodic) return
  if (current)
    await ctx.db.patch(current._id, {
      revision: current.revision + 1,
      nextAt: Date.now(),
      attempts: 0,
    })
  else
    await ctx.db.insert("communityRoleJobs", {
      discordUserId,
      revision: 1,
      leaseUntil: 0,
      attempts: 0,
      nextAt: Date.now(),
    })
}
