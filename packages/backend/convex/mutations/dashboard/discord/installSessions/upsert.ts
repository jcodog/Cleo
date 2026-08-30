import { v } from "convex/values"

import type { Id } from "../../../../_generated/dataModel"
import {
  internalMutation,
  type MutationCtx,
} from "../../../../_generated/server"
import { discordGuildInstallSessionDoc } from "../../../../lib/validators"

export const pending = internalMutation({
  args: {
    userId: v.id("users"),
    discordUserId: v.string(),
    discordGuildId: v.string(),
    expiresAt: v.number(),
  },
  returns: discordGuildInstallSessionDoc,
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await getExistingPendingSession(
      ctx,
      args.userId,
      args.discordGuildId
    )

    if (existing) {
      await ctx.db.patch(existing._id, {
        discordUserId: args.discordUserId,
        expiresAt: args.expiresAt,
        updatedAt: now,
      })

      const updated = await ctx.db.get(existing._id)

      if (!updated) {
        throw new Error("Install session could not be loaded after update.")
      }

      return updated
    }

    const installSessionId = await ctx.db.insert(
      "discordGuildInstallSessions",
      {
        userId: args.userId,
        discordUserId: args.discordUserId,
        discordGuildId: args.discordGuildId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        expiresAt: args.expiresAt,
      }
    )

    const session = await ctx.db.get(installSessionId)

    if (!session) {
      throw new Error("Install session could not be loaded after creation.")
    }

    return session
  },
})

export const botJoined = internalMutation({
  args: {
    discordGuildId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now()

    const sessions = await ctx.db
      .query("discordGuildInstallSessions")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .collect()

    const activePendingSessions = sessions.filter(
      (session) => session.status === "pending" && session.expiresAt > now
    )

    for (const session of activePendingSessions) {
      await ctx.db.patch(session._id, {
        status: "bot_joined",
        updatedAt: now,
      })
    }

    return activePendingSessions.length
  },
})

export const configured = internalMutation({
  args: {
    installSessionId: v.id("discordGuildInstallSessions"),
  },
  returns: discordGuildInstallSessionDoc,
  handler: async (ctx, args) => {
    const now = Date.now()

    await ctx.db.patch(args.installSessionId, {
      status: "configured",
      completedAt: now,
      updatedAt: now,
    })

    const session = await ctx.db.get(args.installSessionId)

    if (!session) {
      throw new Error("Install session could not be loaded after completion.")
    }

    return session
  },
})

async function getExistingPendingSession(
  ctx: MutationCtx,
  userId: Id<"users">,
  discordGuildId: string
) {
  const sessions = await ctx.db
    .query("discordGuildInstallSessions")
    .withIndex("by_user_id_and_status", (q) =>
      q.eq("userId", userId).eq("status", "pending")
    )
    .collect()

  return (
    sessions
      .filter(
        (session) =>
          session.discordGuildId === discordGuildId &&
          session.expiresAt > Date.now()
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
  )
}
