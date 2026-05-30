import type { Doc, Id } from "../_generated/dataModel"

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
