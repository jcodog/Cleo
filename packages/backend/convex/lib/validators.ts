import { v, type Infer } from "convex/values"

const jsonPrimitive = v.union(v.null(), v.boolean(), v.number(), v.string())
const jsonValueLevel1 = v.union(
  jsonPrimitive,
  v.array(jsonPrimitive),
  v.record(v.string(), jsonPrimitive)
)
const jsonValueLevel2 = v.union(
  jsonPrimitive,
  v.array(jsonValueLevel1),
  v.record(v.string(), jsonValueLevel1)
)
const jsonValueLevel3 = v.union(
  jsonPrimitive,
  v.array(jsonValueLevel2),
  v.record(v.string(), jsonValueLevel2)
)
const jsonValueLevel4 = v.union(
  jsonPrimitive,
  v.array(jsonValueLevel3),
  v.record(v.string(), jsonValueLevel3)
)

export const jsonValue = v.union(
  jsonPrimitive,
  v.array(jsonValueLevel4),
  v.record(v.string(), jsonValueLevel4)
)
export const jsonObject = v.record(v.string(), jsonValue)
export const jsonShallowValue = jsonValueLevel1
export const jsonShallowObject = v.record(v.string(), jsonShallowValue)

export type ConvexJsonValue = Infer<typeof jsonValue>
export type ConvexJsonObject = Infer<typeof jsonObject>
export type ConvexJsonShallowValue = Infer<typeof jsonShallowValue>
export type ConvexJsonShallowObject = Infer<typeof jsonShallowObject>

export function isConvexJsonValue(value: unknown): value is ConvexJsonValue {
  return isConvexJsonValueWithDepth(value, 0)
}

export function isConvexJsonObject(value: unknown): value is ConvexJsonObject {
  return (
    isObjectRecord(value) &&
    Object.values(value).every((nestedValue) =>
      isConvexJsonValueWithDepth(nestedValue, 0)
    )
  )
}

export function isConvexJsonShallowValue(
  value: unknown
): value is ConvexJsonShallowValue {
  return isConvexJsonValueWithDepth(value, 4)
}

export function isConvexJsonShallowObject(
  value: unknown
): value is ConvexJsonShallowObject {
  return (
    isObjectRecord(value) &&
    Object.values(value).every(isConvexJsonShallowValue)
  )
}

function isConvexJsonValueWithDepth(
  value: unknown,
  depth: number
): value is ConvexJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true
  }

  if (depth >= 5) {
    return false
  }

  if (Array.isArray(value)) {
    return value.every((nestedValue) =>
      isConvexJsonValueWithDepth(nestedValue, depth + 1)
    )
  }

  if (isObjectRecord(value)) {
    return Object.values(value).every((nestedValue) =>
      isConvexJsonValueWithDepth(nestedValue, depth + 1)
    )
  }

  return false
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const guildConfigLogLevel = v.union(
  v.literal("none"),
  v.literal("minimal"),
  v.literal("medium"),
  v.literal("maximum")
)

export const guildAuditEventSource = v.union(
  v.literal("dashboard"),
  v.literal("discord-audit-log"),
  v.literal("bot-action")
)

export const guildAuditLogSyncStatus = v.union(
  v.literal("ready"),
  v.literal("pendingBotSync"),
  v.literal("discordBotTokenUnavailable"),
  v.literal("discordApiUnavailable")
)

export const discordGuildInstallSessionStatus = v.union(
  v.literal("pending"),
  v.literal("bot_joined"),
  v.literal("configured"),
  v.literal("expired")
)

export const dashboardDiscordUserGuildDiscoveryUnavailableReason = v.union(
  v.literal("clerkSecretUnavailable"),
  v.literal("discordAccessTokenUnavailable"),
  v.literal("discordTokenResolutionUnavailable"),
  v.literal("discordGuildScopeUnavailable"),
  v.literal("discordApiUnavailable")
)

export const dashboardDiscordGuildDiscoveryUnavailableReason = v.union(
  v.literal("clerkSecretUnavailable"),
  v.literal("discordAccessTokenUnavailable"),
  v.literal("discordTokenResolutionUnavailable"),
  v.literal("discordGuildScopeUnavailable"),
  v.literal("discordApiUnavailable"),
  v.literal("discordBotTokenUnavailable"),
  v.literal("discordRestDeniedAccess")
)

export const dashboardDiscordBotVerificationUnavailableReason = v.union(
  v.literal("discordBotTokenUnavailable"),
  v.literal("discordApiUnavailable"),
  v.literal("discordRestDeniedAccess")
)

export const dashboardDiscordGuildForbiddenReason = v.union(
  v.literal("guildNotFoundForUser"),
  v.literal("missingManageGuildPermission")
)

export const dashboardDiscordIdentitySyncResult = v.union(
  v.object({
    status: v.literal("ready"),
  }),
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("unavailable"),
    reason: v.union(
      v.literal("clerkSecretUnavailable"),
      v.literal("clerkUserUnavailable")
    ),
  })
)

export const userDoc = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  clerkUserId: v.string(),
  email: v.string(),
  displayName: v.optional(v.union(v.string(), v.null())),
  imageUrl: v.optional(v.union(v.string(), v.null())),
  role: v.union(
    v.literal("user"),
    v.literal("staff"),
    v.literal("admin"),
    v.literal("superadmin")
  ),
  status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  onboardingCompletedAt: v.optional(v.number()),
  onboardingVersion: v.optional(v.number()),
  onboardingProvenance: v.optional(
    v.union(v.literal("pre-rollout"), v.literal("post-rollout"))
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const linkedAccountDoc = v.object({
  _id: v.id("linkedAccounts"),
  _creationTime: v.number(),
  userId: v.id("users"),
  provider: v.union(
    v.literal("discord"),
    v.literal("kick"),
    v.literal("twitch"),
    v.literal("github")
  ),
  externalProvider: v.optional(v.string()),
  providerAccountId: v.string(),
  username: v.optional(v.string()),
  displayName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  scopes: v.array(v.string()),
  accessTokenSecretId: v.optional(v.string()),
  refreshTokenSecretId: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const dashboardLinkedAccountsSyncResult = v.union(
  v.object({
    status: v.literal("ready"),
    linkedAccounts: v.array(linkedAccountDoc),
  }),
  v.object({
    status: v.literal("unavailable"),
    reason: v.union(
      v.literal("clerkSecretUnavailable"),
      v.literal("clerkUserUnavailable")
    ),
  })
)

export const guildDoc = v.object({
  _id: v.id("guilds"),
  _creationTime: v.number(),
  discordGuildId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
  iconHash: v.optional(v.string()),
  ownerDiscordId: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  presenceCount: v.optional(v.number()),
  botJoinedAt: v.optional(v.number()),
  botInstallationVerifiedAt: v.optional(v.number()),
  botLeftAt: v.optional(v.number()),
  lastOpenedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  readyShardId: v.optional(v.number()),
  readyShardCount: v.optional(v.number()),
  readyShardKey: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const guildConfigDoc = v.object({
  _id: v.id("guildConfigs"),
  _creationTime: v.number(),
  guildId: v.id("guilds"),
  aiEnabled: v.boolean(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  logLevel: v.optional(guildConfigLogLevel),
  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),
  welcomeSubtext: v.optional(v.string()),
  updatesChannelId: v.optional(v.string()),
  announcementChannelId: v.optional(v.string()),
  commandPrefix: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const discordGuildMembershipDoc = v.object({
  _id: v.id("discordGuildMemberships"),
  _creationTime: v.number(),
  guildId: v.id("guilds"),
  userId: v.optional(v.id("users")),
  discordUserId: v.string(),
  isOwner: v.optional(v.boolean()),
  canManage: v.boolean(),
  managementVerifiedAt: v.optional(v.number()),
  managementVerificationSource: v.optional(
    v.union(
      v.literal("discord-bot"),
      v.literal("discord-oauth"),
      v.literal("manual")
    )
  ),
  permissions: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const discordGuildInstallSessionDoc = v.object({
  _id: v.id("discordGuildInstallSessions"),
  _creationTime: v.number(),
  userId: v.id("users"),
  discordUserId: v.string(),
  discordGuildId: v.string(),
  status: discordGuildInstallSessionStatus,
  selectedUpdatesChannelId: v.optional(v.string()),
  oauthState: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
  completedAt: v.optional(v.number()),
})

export const dashboardDiscordGuildSelectorViewModel = v.object({
  guildId: v.id("guilds"),
  discordGuildId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
  iconHash: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  presenceCount: v.optional(v.number()),
  botJoinedAt: v.optional(v.number()),
  botInstallationVerifiedAt: v.optional(v.number()),
  isOwner: v.optional(v.boolean()),
  permissions: v.optional(v.string()),
  lastOpenedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
})

export const dashboardDiscordInstallSessionViewModel = v.object({
  installSessionId: v.id("discordGuildInstallSessions"),
  discordGuildId: v.string(),
  status: discordGuildInstallSessionStatus,
  selectedUpdatesChannelId: v.optional(v.string()),
  expiresAt: v.number(),
  completedAt: v.optional(v.number()),
})

export const dashboardDiscordInstallableGuildViewModel = v.object({
  discordGuildId: v.string(),
  name: v.string(),
  iconUrl: v.optional(v.string()),
  iconHash: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  presenceCount: v.optional(v.number()),
  isOwner: v.optional(v.boolean()),
  permissions: v.optional(v.string()),
  state: v.union(
    v.literal("installed"),
    v.literal("installable"),
    v.literal("pending"),
    v.literal("verificationNeeded"),
    v.literal("unavailable"),
    v.literal("forbidden")
  ),
  unavailableReason: v.optional(
    v.union(
      v.literal("missingManageGuildPermission"),
      v.literal("botLeft"),
      v.literal("botSyncUnavailable"),
      v.literal("verificationUnavailable"),
      v.literal("discordBotTokenUnavailable"),
      v.literal("discordApiUnavailable"),
      v.literal("discordRestDeniedAccess")
    )
  ),
  installSessionId: v.optional(v.id("discordGuildInstallSessions")),
  installSessionStatus: v.optional(discordGuildInstallSessionStatus),
  installSessionExpiresAt: v.optional(v.number()),
  dashboardHref: v.optional(v.string()),
})

export const dashboardDiscordInstallableGuildsResult = v.union(
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("discordGuildDiscoveryUnavailable"),
    reason: dashboardDiscordUserGuildDiscoveryUnavailableReason,
    guilds: v.array(dashboardDiscordInstallableGuildViewModel),
  }),
  v.object({
    status: v.literal("ready"),
    guilds: v.array(dashboardDiscordInstallableGuildViewModel),
  })
)

export const dashboardDiscordCreateServerInstallResult = v.union(
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("alreadyInstalled"),
    discordGuildId: v.string(),
    targetPath: v.string(),
  }),
  v.object({
    status: v.literal("verificationUnavailable"),
    reason: dashboardDiscordGuildDiscoveryUnavailableReason,
  }),
  v.object({
    status: v.literal("forbidden"),
    reason: dashboardDiscordGuildForbiddenReason,
  }),
  v.object({
    status: v.literal("configUnavailable"),
    reason: v.literal("discordApplicationIdMissing"),
  }),
  v.object({
    status: v.literal("created"),
    discordGuildId: v.string(),
    installSessionId: v.id("discordGuildInstallSessions"),
    expiresAt: v.number(),
    installUrl: v.string(),
  })
)

export const dashboardDiscordPendingChannelViewModel = v.object({
  discordChannelId: v.string(),
  name: v.string(),
  type: v.union(v.literal("text"), v.literal("announcement")),
  position: v.optional(v.number()),
})

export const dashboardDiscordPendingChannelsResult = v.union(
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("pendingBotSync"),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("notInstalled"),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("userGuildDiscoveryUnavailable"),
    reason: dashboardDiscordUserGuildDiscoveryUnavailableReason,
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("channelDiscoveryUnavailable"),
    reason: dashboardDiscordBotVerificationUnavailableReason,
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("ready"),
    discordGuildId: v.string(),
    channels: v.array(dashboardDiscordPendingChannelViewModel),
  })
)

export const dashboardDiscordCompleteServerInstallResult = v.union(
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("pendingBotSync"),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("notInstalled"),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("userGuildDiscoveryUnavailable"),
    reason: dashboardDiscordUserGuildDiscoveryUnavailableReason,
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("botVerificationUnavailable"),
    reason: dashboardDiscordBotVerificationUnavailableReason,
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("completed"),
    discordGuildId: v.string(),
    targetPath: v.string(),
  })
)

export const dashboardDiscordGuildOverviewMembershipViewModel = v.object({
  membershipId: v.id("discordGuildMemberships"),
  guildId: v.id("guilds"),
  userId: v.optional(v.id("users")),
  discordUserId: v.string(),
  isOwner: v.optional(v.boolean()),
  canManage: v.boolean(),
  managementVerifiedAt: v.optional(v.number()),
  managementVerificationSource: v.optional(
    v.union(
      v.literal("discord-bot"),
      v.literal("discord-oauth"),
      v.literal("manual")
    )
  ),
  permissions: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
})

export const dashboardDiscordGuildOverviewConfigViewModel = v.object({
  guildConfigId: v.id("guildConfigs"),
  guildId: v.id("guilds"),
  aiEnabled: v.boolean(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  logLevel: v.optional(guildConfigLogLevel),
  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),
  welcomeSubtext: v.optional(v.string()),
  updatesChannelId: v.optional(v.string()),
  announcementChannelId: v.optional(v.string()),
  commandPrefix: v.optional(v.string()),
  updatedAt: v.number(),
})

export const dashboardDiscordGuildOverviewViewModel = v.object({
  guildId: v.id("guilds"),
  discordGuildId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
  iconHash: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  presenceCount: v.optional(v.number()),
  botJoinedAt: v.optional(v.number()),
  botInstallationVerifiedAt: v.optional(v.number()),
  botLeftAt: v.optional(v.number()),
  lastOpenedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  membership: dashboardDiscordGuildOverviewMembershipViewModel,
  guildConfig: v.union(dashboardDiscordGuildOverviewConfigViewModel, v.null()),
})

export const dashboardDiscordGuildOverviewResult = v.union(
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("botLeft"),
    overview: dashboardDiscordGuildOverviewViewModel,
  }),
  v.object({
    status: v.literal("ready"),
    overview: dashboardDiscordGuildOverviewViewModel,
  })
)

export const dashboardDiscordGuildSystemLogViewModel = v.object({
  logId: v.id("errorLogs"),
  source: v.union(
    v.literal("dashboard"),
    v.literal("discord-bot"),
    v.literal("kick-bot"),
    v.literal("ws-relay"),
    v.literal("backend")
  ),
  level: v.union(
    v.literal("debug"),
    v.literal("info"),
    v.literal("warn"),
    v.literal("error")
  ),
  message: v.string(),
  createdAt: v.number(),
})

export const dashboardDiscordGuildSystemLogsResult = v.union(
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("ready"),
    logs: v.array(dashboardDiscordGuildSystemLogViewModel),
  })
)

export const dashboardDiscordGuildAuditEventViewModel = v.object({
  auditEventId: v.id("guildAuditEvents"),
  source: guildAuditEventSource,
  eventType: v.string(),
  summary: v.string(),
  details: v.array(v.string()),
  actorDiscordUserId: v.optional(v.string()),
  actorDisplayName: v.optional(v.string()),
  targetDiscordId: v.optional(v.string()),
  targetType: v.optional(v.string()),
  externalId: v.optional(v.string()),
  occurredAt: v.number(),
})

export const dashboardDiscordGuildAuditLogSyncStateViewModel = v.object({
  syncStateId: v.id("guildAuditLogSyncStates"),
  newestDiscordAuditLogId: v.optional(v.string()),
  newestOccurredAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  lastSyncStatus: guildAuditLogSyncStatus,
  lastSyncError: v.optional(v.string()),
  updatedAt: v.number(),
})

export const dashboardDiscordGuildAuditEventsResult = v.union(
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("ready"),
    events: v.array(dashboardDiscordGuildAuditEventViewModel),
    syncState: v.union(
      dashboardDiscordGuildAuditLogSyncStateViewModel,
      v.null()
    ),
  })
)

export const dashboardDiscordAuditLogSyncResult = v.union(
  v.object({
    status: v.literal("notFound"),
  }),
  v.object({
    status: v.literal("forbidden"),
  }),
  v.object({
    status: v.literal("pendingBotSync"),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("auditLogSyncUnavailable"),
    reason: v.union(
      v.literal("discordBotTokenUnavailable"),
      v.literal("discordApiUnavailable")
    ),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("ready"),
    discordGuildId: v.string(),
    inserted: v.number(),
    skipped: v.number(),
    lastSyncedAt: v.number(),
    newestDiscordAuditLogId: v.optional(v.string()),
  })
)

export const dashboardDiscordVerifyInstalledGuildResult = v.union(
  v.object({
    status: v.literal("missingDiscordIdentity"),
  }),
  v.object({
    status: v.literal("userGuildDiscoveryUnavailable"),
    reason: dashboardDiscordUserGuildDiscoveryUnavailableReason,
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("forbidden"),
    reason: dashboardDiscordGuildForbiddenReason,
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("botVerificationUnavailable"),
    reason: dashboardDiscordBotVerificationUnavailableReason,
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("notInstalled"),
    discordGuildId: v.string(),
  }),
  v.object({
    status: v.literal("installed"),
    discordGuildId: v.string(),
    targetPath: v.string(),
  })
)
