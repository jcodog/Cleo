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
