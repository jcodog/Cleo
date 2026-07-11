import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import type { AppFeatureKey } from "../dbTables/appFeatureGates"

export function isAppFeatureGateEnabledForUser(
  gate: Pick<
    Doc<"appFeatureGates">,
    "enabled" | "enabledForClerkUserIds"
  > | null,
  user: Pick<Doc<"users">, "clerkUserId">
): boolean {
  if (!gate) {
    return false
  }

  return (
    gate.enabled ||
    gate.enabledForClerkUserIds?.includes(user.clerkUserId) === true
  )
}

export async function isAppFeatureEnabledForUser(
  ctx: QueryCtx,
  key: AppFeatureKey,
  user: Pick<Doc<"users">, "clerkUserId">
): Promise<boolean> {
  const gate = await ctx.db
    .query("appFeatureGates")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()

  return isAppFeatureGateEnabledForUser(gate, user)
}
