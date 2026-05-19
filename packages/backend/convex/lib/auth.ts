import { ConvexError } from "convex/values"
import type { UserIdentity } from "convex/server"

import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

type AuthCtx = QueryCtx | MutationCtx

export async function getCurrentIdentity(
  ctx: AuthCtx
): Promise<UserIdentity | null> {
  return await ctx.auth.getUserIdentity()
}

export async function getCurrentUser(
  ctx: AuthCtx
): Promise<Doc<"users"> | null> {
  const identity = await getCurrentIdentity(ctx)

  if (!identity) {
    return null
  }

  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) =>
      q.eq("clerkUserId", identity.subject)
    )
    .unique()
}

export async function requireCurrentUser(
  ctx: AuthCtx
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx)

  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "You must be signed in.",
    })
  }

  if (user.status === "disabled") {
    throw new ConvexError({
      code: "USER_DISABLED",
      message: "This account is disabled.",
    })
  }

  return user
}

export async function requireStaff(ctx: AuthCtx): Promise<Doc<"users">> {
  const user = await requireCurrentUser(ctx)

  if (!["staff", "admin", "superadmin"].includes(user.role)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Staff access is required.",
    })
  }

  return user
}

export async function requireAdmin(ctx: AuthCtx): Promise<Doc<"users">> {
  const user = await requireCurrentUser(ctx)

  if (!["admin", "superadmin"].includes(user.role)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Admin access is required.",
    })
  }

  return user
}

export async function requireDiscordGuildManager(
  ctx: AuthCtx,
  guildId: Doc<"guilds">["_id"]
): Promise<Doc<"discordGuildMemberships">> {
  const user = await requireCurrentUser(ctx)

  const directMembership = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_user_id_and_guild_id", (q) =>
      q.eq("userId", user._id).eq("guildId", guildId)
    )
    .unique()

  if (isVerifiedGuildManager(directMembership)) {
    return directMembership
  }

  const discordAccount = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .filter((q) => q.eq(q.field("provider"), "discord"))
    .first()

  if (!discordAccount) {
    throwForbiddenGuildAccess()
  }

  const membership = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_guild_id_and_discord_user_id", (q) =>
      q.eq("guildId", guildId).eq("discordUserId", discordAccount.providerAccountId)
    )
    .unique()

  if (!isVerifiedGuildManager(membership)) {
    throwForbiddenGuildAccess()
  }

  return membership
}

function isVerifiedGuildManager(
  membership: Doc<"discordGuildMemberships"> | null
): membership is Doc<"discordGuildMemberships"> {
  return Boolean(
    membership?.canManage &&
      membership.managementVerifiedAt !== undefined &&
      membership.revokedAt === undefined
  )
}

function throwForbiddenGuildAccess(): never {
  throw new ConvexError({
    code: "FORBIDDEN",
    message: "Verified Discord guild management access is required.",
  })
}
