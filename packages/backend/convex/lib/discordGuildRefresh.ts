import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import {
  currentDiscordAccount,
  DISCORD_MANAGEMENT_TTL,
} from "./discordGuildMemberships"
import { queueRoleSync } from "./cleoRoleEligibility"

/** Each transaction visits at most 100 stored and 50 incoming memberships. */
export async function reconcileDiscordGuildRefresh(
  ctx: MutationCtx,
  id: Id<"discordGuildRefreshes">,
  revision: number
) {
  const refresh = await ctx.db.get(id)
  if (!refresh || refresh.revision !== revision || refresh.state !== "pending")
    return
  const account = await currentDiscordAccount(ctx, refresh.userId)
  const user = await ctx.db.get(refresh.userId)
  if (
    !account ||
    account._id !== refresh.linkedAccountId ||
    account.providerAccountId !== refresh.discordUserId ||
    !user ||
    user.status === "disabled" ||
    refresh.startedAt <= Date.now() - DISCORD_MANAGEMENT_TTL
  ) {
    await ctx.db.patch(id, { state: "failed", guilds: [] })
    await queueRoleSync(ctx, refresh.discordUserId)
    return
  }
  let phase = refresh.phase,
    cursor = refresh.cursor,
    offset = refresh.offset
  if (phase === "existing") {
    const page = await ctx.db
      .query("discordGuildMemberships")
      .withIndex("by_discord_user_id", (q) =>
        q.eq("discordUserId", refresh.discordUserId)
      )
      .paginate({ cursor: cursor ?? null, numItems: 100 })
    const incoming = new Set(refresh.guilds.map((guild) => guild.id))
    for (const membership of page.page) {
      const guild = await ctx.db.get(membership.guildId)
      if (!guild || !incoming.has(guild.discordGuildId)) {
        // Do not overwrite a separately verified observation newer than this snapshot.
        if ((membership.managementVerifiedAt ?? 0) > refresh.startedAt) continue
        await ctx.db.patch(membership._id, {
          revokedAt: refresh.startedAt,
          canManage: false,
          isOwner: false,
          permissions: "0",
          managementVerifiedAt: refresh.startedAt,
          updatedAt: Date.now(),
        })
        if (guild?.ownerDiscordId === refresh.discordUserId)
          await ctx.db.patch(guild._id, { ownerDiscordId: undefined })
      }
    }
    if (page.isDone) {
      phase = "incoming"
      cursor = undefined
    } else cursor = page.continueCursor
  }
  if (phase === "incoming") {
    const batch = refresh.guilds.slice(offset, offset + 50)
    for (const incoming of batch) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discord_guild_id", (q) =>
          q.eq("discordGuildId", incoming.id)
        )
        .unique()
      if (!guild || guild.botLeftAt !== undefined) continue
      const current = await ctx.db
        .query("discordGuildMemberships")
        .withIndex("by_guild_id_and_discord_user_id", (q) =>
          q.eq("guildId", guild._id).eq("discordUserId", refresh.discordUserId)
        )
        .unique()
      if ((current?.managementVerifiedAt ?? 0) > refresh.startedAt) continue
      let canManage = incoming.owner === true
      try {
        canManage ||= (BigInt(incoming.permissions ?? "0") & 40n) !== 0n
      } catch {
        /* Malformed permissions confer no authority. */
      }
      const value = {
        guildId: guild._id,
        userId: refresh.userId,
        discordUserId: refresh.discordUserId,
        isOwner: incoming.owner === true,
        permissions: incoming.permissions ?? "0",
        canManage,
        managementVerifiedAt: refresh.startedAt,
        managementVerificationSource: "discord-oauth" as const,
        revokedAt: undefined,
        createdAt: current?.createdAt ?? refresh.startedAt,
        updatedAt: Date.now(),
      }
      if (current) await ctx.db.patch(current._id, value)
      else await ctx.db.insert("discordGuildMemberships", value)
      if (incoming.owner)
        await ctx.db.patch(guild._id, { ownerDiscordId: refresh.discordUserId })
      else if (guild.ownerDiscordId === refresh.discordUserId)
        await ctx.db.patch(guild._id, { ownerDiscordId: undefined })
    }
    offset += batch.length
  }
  const complete = phase === "incoming" && offset >= refresh.guilds.length
  await ctx.db.patch(id, {
    phase,
    cursor,
    offset,
    state: complete ? "complete" : "pending",
    ...(complete ? { guilds: [] } : {}),
  })
  if (complete) {
    if (!refresh.reconciliation) await queueRoleSync(ctx, refresh.discordUserId)
  } else
    await ctx.scheduler.runAfter(
      0,
      internal.communityRoles.continueGuildRefresh,
      { id, revision }
    )
}
