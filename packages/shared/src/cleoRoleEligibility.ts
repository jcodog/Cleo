export const CLEO_COMMUNITY_ROLES = [
  "member",
  "personalPremium",
  "creatorPro",
  "discordBotUser",
  "twitchBotUser",
  "communityOwner",
  "premiumCommunityOwner",
  "communityManager",
  "premiumCommunityManager",
  "premiumSupporter",
] as const
export type CleoCommunityRole = (typeof CLEO_COMMUNITY_ROLES)[number]
export type RoleEligibilityStatus =
  "eligible" | "notEligible" | "verificationNeeded" | "unavailable"
export type CleoRoleEvidence = {
  now: number
  verifiedAccount: boolean
  officialGuildId?: string
  personalPaid?: boolean
  creatorPaid?: boolean
  installation?: {
    state: "active" | "uncertain" | "revoked"
    expiresAt: number
  }
  twitchActive: boolean
  communities: readonly {
    id: string
    owner: boolean
    administrator: boolean
    installed: boolean
    verifiedAt: number
    premium: boolean
  }[]
  paidSupporter: boolean
}
export function resolveCleoRoleEligibility(
  evidence: CleoRoleEvidence
): Record<CleoCommunityRole, RoleEligibilityStatus> {
  const status = (eligible: boolean): RoleEligibilityStatus =>
    evidence.verifiedAccount && eligible ? "eligible" : "notEligible"
  const fresh = evidence.communities.filter(
    (g) =>
      g.id !== evidence.officialGuildId &&
      g.installed &&
      g.verifiedAt <= evidence.now &&
      g.verifiedAt > evidence.now - 300000
  )
  const owners = fresh.filter((g) => g.owner)
  const managers = fresh.filter((g) => !g.owner && g.administrator)
  const stale = evidence.communities.some(
    (g) =>
      g.id !== evidence.officialGuildId &&
      g.installed &&
      g.verifiedAt <= evidence.now - 300000
  )
  const communityStatus = (eligible: boolean): RoleEligibilityStatus =>
    !evidence.officialGuildId
      ? "unavailable"
      : !evidence.verifiedAccount
        ? "notEligible"
        : eligible
          ? "eligible"
          : stale
            ? "verificationNeeded"
            : "notEligible"
  return {
    member: status(true),
    personalPremium:
      evidence.personalPaid === undefined
        ? "unavailable"
        : status(evidence.personalPaid),
    creatorPro:
      evidence.creatorPaid === undefined
        ? "unavailable"
        : status(evidence.creatorPaid),
    discordBotUser: !evidence.verifiedAccount
      ? "notEligible"
      : evidence.installation?.state === "active" &&
          evidence.installation.expiresAt > evidence.now
        ? "eligible"
        : evidence.installation?.state === "uncertain" ||
            evidence.installation?.state === "active"
          ? "verificationNeeded"
          : "notEligible",
    twitchBotUser: status(evidence.twitchActive),
    communityOwner: communityStatus(owners.length > 0),
    premiumCommunityOwner: communityStatus(owners.some((g) => g.premium)),
    communityManager: communityStatus(managers.length > 0),
    premiumCommunityManager: communityStatus(managers.some((g) => g.premium)),
    premiumSupporter: status(evidence.paidSupporter),
  }
}
export function cleoRoleMetadata(
  roles: Record<CleoCommunityRole, RoleEligibilityStatus>
) {
  return {
    personal_premium: roles.personalPremium === "eligible" ? "1" : "0",
    creator_pro: roles.creatorPro === "eligible" ? "1" : "0",
    community_owner_tier:
      roles.premiumCommunityOwner === "eligible"
        ? "2"
        : roles.communityOwner === "eligible"
          ? "1"
          : "0",
    community_manager_tier:
      roles.premiumCommunityManager === "eligible"
        ? "2"
        : roles.communityManager === "eligible"
          ? "1"
          : "0",
    premium_supporter: roles.premiumSupporter === "eligible" ? "1" : "0",
  }
}
export const CLEO_ROLE_FAQ = [
  "# Cleo community roles",
  "Roles describe your verified relationship with Cleo and independent communities. Community Owner and Community Manager never give ownership, staff status, or administrative permissions in Cleo's official Discord server. Roles have no privileged permissions.",
  "Member: an active Cleo account with a verified linked Discord identity. Join the official server to receive its roles.",
  "Personal Premium: an active paid personal subscription. Unavailable until personal billing is integrated.",
  "Creator Pro: an active paid creator subscription. Using Twitch, following a channel or connecting the chatbot does not qualify. Unavailable until creator billing is integrated.",
  "Discord Bot User: a verified current installation to your Discord account. Use Add Cleo to my Discord account, then /ping to verify your user installation. Server installation alone does not qualify. Reverification may be needed after the evidence expires.",
  "Twitch Bot User: your verified linked broadcaster has active chat consent and a current Cleo chatbot connection. Linking Twitch alone does not qualify.",
  "Community Owner: you own an independent Discord server with Cleo installed. Premium Community Owner additionally requires that server's active Premium coverage. Both roles can apply.",
  "Community Manager: you currently have Administrator in another independent Cleo-installed Discord server. Manage Server alone does not qualify. Premium Community Manager additionally requires active Premium. Owners do not automatically count as managers of their own server.",
  "Premium Supporter: you currently fund verified paid server Premium coverage and opt into displaying this role. Free trials, test/staff grants and unpaid checkouts do not qualify. Payment never transfers ownership or grants administration.",
  "Link Discord through your Cleo account. Visit Account and roles in the dashboard to refresh verification. For native Linked Roles, connect Cleo through the verification link and claim the eligible role in Discord. Premium Supporter is deliberately opt-in and claimed through Discord; the bot does not assign it automatically.",
  "Automatic roles and native verification are separate. Roles can stack. Losing a link, installation, current permissions, paid eligibility or consent removes the corresponding current eligibility. Other roles remain independent. You can still manage your own subscription if you lose server administration.",
  "Public purchase announcements and visible Supporter roles are separate opt-ins. Both start off. Announcing a community also requires that community's permission to publish its identity. Private payment details are never published.",
].join("\n\n")
