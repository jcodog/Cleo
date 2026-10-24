import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { announcementDoc } from "./lib/communityValidators"
import { getGuildAccess } from "./lib/guildEntitlements"
import { backendEnv } from "@workspace/env/backend"
const payload = v.object({
  id: v.id("communityAnnouncementOutbox"),
  key: v.string(),
  discordUserId: v.string(),
  name: v.string(),
  purchaserKind: v.union(v.literal("owner"), v.literal("administrator")),
})
export const claim = internalMutation({
  args: { attempt: v.string() },
  returns: v.union(payload, v.null()),
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("communityAnnouncementOutbox")
      .withIndex("by_state_updated", (q) =>
        q.eq("state", "sending").lt("updatedAt", Date.now() - 60000)
      )
      .take(20)
    for (const row of stale)
      await ctx.db.patch(row._id, {
        state: "uncertain",
        updatedAt: Date.now(),
      })
    const row = await ctx.db
      .query("communityAnnouncementOutbox")
      .withIndex("by_state", (q) => q.eq("state", "pending"))
      .first()
    if (!row) return null
    const activation = await ctx.db.get(row.activationId)
    const guild = activation ? await ctx.db.get(activation.guildId) : null
    const consent = guild
      ? await ctx.db
          .query("communityPreferences")
          .withIndex("by_guild", (q) => q.eq("guildId", guild._id))
          .unique()
      : null
    const user = activation ? await ctx.db.get(activation.userId) : null
    const discord = activation
      ? await ctx.db
          .query("linkedAccounts")
          .withIndex("by_user_provider", (q) =>
            q.eq("userId", activation.userId).eq("provider", "discord")
          )
          .take(2)
      : []
    if (
      !activation ||
      activation.testMode ||
      activation.revoked ||
      activation.paidUntil <= Date.now() ||
      !activation.announce ||
      !consent?.publishIdentity ||
      !guild ||
      guild.botLeftAt !== undefined ||
      !user ||
      user.status === "disabled" ||
      discord.length !== 1 ||
      discord[0]?.providerAccountId !== activation.discordUserId ||
      guild.discordGuildId === backendEnv.CLEO_OFFICIAL_GUILD_ID ||
      !(await getGuildAccess(ctx, guild, Date.now(), { includeRevoked: false }))
        .capabilities.length
    ) {
      await ctx.db.patch(row._id, {
        state: "suppressed",
        updatedAt: Date.now(),
      })
      return null
    }
    await ctx.db.patch(row._id, {
      state: "sending",
      attempt: args.attempt,
      updatedAt: Date.now(),
    })
    return {
      id: row._id,
      key: row.key,
      discordUserId: activation.discordUserId,
      name: guild.name,
      purchaserKind: activation.purchaserKind,
    }
  },
})
export const settle = internalMutation({
  args: {
    id: v.id("communityAnnouncementOutbox"),
    attempt: v.string(),
    messageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (row?.state === "sending" && row.attempt === args.attempt)
      await ctx.db.patch(row._id, {
        state: args.messageId ? "sent" : "uncertain",
        messageId: args.messageId,
        updatedAt: Date.now(),
      })
    return null
  },
})
export const uncertain = internalQuery({
  args: {},
  returns: v.array(announcementDoc),
  handler: (ctx) =>
    ctx.db
      .query("communityAnnouncementOutbox")
      .withIndex("by_state", (q) => q.eq("state", "uncertain"))
      .take(20),
})
export const reconciled = internalMutation({
  args: {
    id: v.id("communityAnnouncementOutbox"),
    messageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (row?.state === "uncertain")
      await ctx.db.patch(row._id, {
        state: args.messageId ? "sent" : "investigation",
        messageId: args.messageId,
        updatedAt: Date.now(),
      })
    return null
  },
})
