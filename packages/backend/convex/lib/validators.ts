import { v } from "convex/values"

export const guildConfigLogLevel = v.union(
  v.literal("none"),
  v.literal("minimal"),
  v.literal("medium"),
  v.literal("maximum")
)

export const discordGuildInstallSessionStatus = v.union(
  v.literal("pending"),
  v.literal("bot_joined"),
  v.literal("configured"),
  v.literal("expired")
)

export const userDoc = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  clerkUserId: v.string(),
  email: v.string(),
  displayName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  role: v.union(
    v.literal("user"),
    v.literal("staff"),
    v.literal("admin"),
    v.literal("superadmin")
  ),
  status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
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
  botLeftAt: v.optional(v.number()),
  lastOpenedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
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
    v.literal("unavailable")
  ),
  unavailableReason: v.optional(
    v.union(
      v.literal("missingManageGuildPermission"),
      v.literal("botLeft"),
      v.literal("botSyncUnavailable"),
      v.literal("verificationUnavailable")
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
    reason: v.union(
      v.literal("discordAccessTokenUnavailable"),
      v.literal("discordTokenResolutionUnavailable")
    ),
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
    reason: v.literal("discordGuildDiscoveryUnavailable"),
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
    status: v.literal("channelDiscoveryUnavailable"),
    reason: v.union(
      v.literal("discordBotTokenUnavailable"),
      v.literal("discordApiUnavailable")
    ),
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
  stack: v.optional(v.string()),
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
