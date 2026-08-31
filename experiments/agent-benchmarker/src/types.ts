export type DiscordRole = {
  id: string;
  name: string;
  position: number;
  managed: boolean;
  color: number;
  permissionsRaw: string;
  permissions: string[];
  memberCount: number | null;
};

export type PermissionOverwrite = {
  id: string;
  type: 0 | 1;
  targetType: 'role' | 'member';
  targetName: string | null;
  allowRaw: string;
  denyRaw: string;
  allow: string[];
  deny: string[];
};

export type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  typeName: string;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  rateLimitPerUser: number | null;
  bitrate: number | null;
  userLimit: number | null;
  flags: number | null;
  permissionOverwrites: PermissionOverwrite[];
};

export type GuildSnapshot = {
  capturedAt: string | null;
  guild: {
    id: string;
    name: string;
    description: string | null;
    ownerId: string;
    memberCount: number | null;
    presenceCount: number | null;
    features: string[];
    verificationLevel: number;
    explicitContentFilter: number;
    defaultMessageNotifications: number;
    premiumTier: number;
    systemChannelId: string | null;
    rulesChannelId: string | null;
    publicUpdatesChannelId: string | null;
    safetyAlertsChannelId: string | null;
  };
  roles: DiscordRole[];
  channels: DiscordChannel[];
  optional: Record<string, unknown>;
  bot: {
    id: string | null;
    username: string | null;
    roleIds: string[];
    guildPermissionsRaw: string;
    guildPermissions: string[];
    administrator: boolean;
    canManageGuild: boolean;
    canManageChannels: boolean;
    canManageRoles: boolean;
    completeChannelVisibilityGuaranteed: boolean;
  };
};

export type OwnerScenario = {
  id: string;
  title: string;
  ownerContext: Record<string, unknown>;
  firstMessage: string;
  approvalMessage: string;
};

export type DiscordOperation = {
  kind: 'create_category' | 'create_channel' | 'update_channel' | 'delete_channel' | 'create_role' | 'update_role';
  reason: string;
  tempId?: string;
  targetId?: string;
  name?: string;
  channelType?: 'text' | 'voice' | 'announcement' | 'forum';
  parentId?: string | null;
  topic?: string | null;
  position?: number;
  userLimit?: number | null;
  bitrate?: number | null;
  permissions?: Array<{
    targetId: string;
    targetType: 'role' | 'member';
    allow?: string[];
    deny?: string[];
  }>;
  color?: number;
};

export type ToolInput = {
  action: 'inspect' | 'apply';
  summary?: string;
  operations?: DiscordOperation[];
};

export type TraceEvent = {
  at: string;
  phase: 'setup' | 'recommendation' | 'approval' | 'report';
  type: string;
  data: unknown;
};

export type GatewayUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
};
