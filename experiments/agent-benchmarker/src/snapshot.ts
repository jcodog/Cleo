import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { combinePermissions, decodePermissions } from './permissions.ts';
import type { GuildSnapshot } from './types.ts';

const CHANNEL_TYPES: Record<number, string> = {
  0: 'text', 1: 'dm', 2: 'voice', 3: 'group_dm', 4: 'category', 5: 'announcement',
  10: 'announcement_thread', 11: 'public_thread', 12: 'private_thread', 13: 'stage',
  14: 'directory', 15: 'forum', 16: 'media',
};

async function readJson(path: string, optional = false): Promise<any> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (optional) return null;
    throw new Error(`Unable to read fixture file ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function endpointValue(value: unknown): unknown {
  if (value && typeof value === 'object' && '_captureError' in value) return value;
  return value;
}

export async function loadGuildSnapshot(fixtureDir: string): Promise<GuildSnapshot> {
  const prebuilt = await readJson(join(fixtureDir, 'snapshot.json'), true);
  if (prebuilt) return prebuilt as GuildSnapshot;

  const rawDir = join(fixtureDir, 'raw');
  const guild = await readJson(join(rawDir, 'guild.json'));
  const channels = await readJson(join(rawDir, 'channels.json'));
  const roles = await readJson(join(rawDir, 'roles.json'));
  const roleMemberCounts = await readJson(join(rawDir, 'role-member-counts.json'), true);
  const botUser = await readJson(join(rawDir, 'bot-user.json'), true);
  const botMember = await readJson(join(rawDir, 'bot-member.json'), true);
  const manifest = await readJson(join(fixtureDir, 'manifest.json'), true);

  const memberCounts = roleMemberCounts && typeof roleMemberCounts === 'object' && !roleMemberCounts._captureError
    ? roleMemberCounts
    : {};

  const normalizedRoles = (Array.isArray(roles) ? roles : []).map((role: any) => ({
    id: String(role.id),
    name: String(role.name),
    position: Number(role.position ?? 0),
    managed: Boolean(role.managed),
    color: Number(role.colors?.primary_color ?? role.color ?? 0),
    permissionsRaw: String(role.permissions ?? '0'),
    permissions: decodePermissions(role.permissions),
    memberCount: typeof memberCounts[String(role.id)] === 'number' ? memberCounts[String(role.id)] : null,
  }));

  const roleNames = new Map(normalizedRoles.map(role => [role.id, role.name]));
  const normalizedChannels = (Array.isArray(channels) ? channels : []).map((channel: any) => ({
    id: String(channel.id),
    name: String(channel.name ?? ''),
    type: Number(channel.type),
    typeName: CHANNEL_TYPES[Number(channel.type)] ?? `unknown_${channel.type}`,
    parentId: channel.parent_id ? String(channel.parent_id) : null,
    position: Number(channel.position ?? 0),
    topic: typeof channel.topic === 'string' ? channel.topic : null,
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: typeof channel.rate_limit_per_user === 'number' ? channel.rate_limit_per_user : null,
    bitrate: typeof channel.bitrate === 'number' ? channel.bitrate : null,
    userLimit: typeof channel.user_limit === 'number' ? channel.user_limit : null,
    flags: typeof channel.flags === 'number' ? channel.flags : null,
    permissionOverwrites: (Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : []).map((overwrite: any) => ({
      id: String(overwrite.id),
      type: Number(overwrite.type) === 1 ? 1 as const : 0 as const,
      targetType: Number(overwrite.type) === 1 ? 'member' as const : 'role' as const,
      targetName: Number(overwrite.type) === 0 ? roleNames.get(String(overwrite.id)) ?? null : null,
      allowRaw: String(overwrite.allow ?? '0'),
      denyRaw: String(overwrite.deny ?? '0'),
      allow: decodePermissions(overwrite.allow),
      deny: decodePermissions(overwrite.deny),
    })),
  }));

  const everyone = normalizedRoles.find(role => role.id === String(guild.id));
  const botRoleIds = Array.isArray(botMember?.roles) ? botMember.roles.map(String) : [];
  const botRoles = normalizedRoles.filter(role => botRoleIds.includes(role.id));
  const basePermissions = combinePermissions([
    everyone?.permissionsRaw ?? '0',
    ...botRoles.map(role => role.permissionsRaw),
  ]);
  const botPermissions = decodePermissions(basePermissions);
  const administrator = botPermissions.includes('ADMINISTRATOR');

  const optionalNames = ['onboarding', 'welcome-screen', 'automod', 'scheduled-events', 'active-threads', 'integrations', 'invites'];
  const optional: Record<string, unknown> = {};
  for (const name of optionalNames) {
    optional[name] = endpointValue(await readJson(join(rawDir, `${name}.json`), true));
  }

  return {
    capturedAt: typeof manifest?.capturedAt === 'string' ? manifest.capturedAt : null,
    guild: {
      id: String(guild.id),
      name: String(guild.name),
      description: typeof guild.description === 'string' ? guild.description : null,
      ownerId: String(guild.owner_id ?? ''),
      memberCount: typeof guild.approximate_member_count === 'number' ? guild.approximate_member_count : null,
      presenceCount: typeof guild.approximate_presence_count === 'number' ? guild.approximate_presence_count : null,
      features: Array.isArray(guild.features) ? guild.features.map(String) : [],
      verificationLevel: Number(guild.verification_level ?? 0),
      explicitContentFilter: Number(guild.explicit_content_filter ?? 0),
      defaultMessageNotifications: Number(guild.default_message_notifications ?? 0),
      premiumTier: Number(guild.premium_tier ?? 0),
      systemChannelId: guild.system_channel_id ? String(guild.system_channel_id) : null,
      rulesChannelId: guild.rules_channel_id ? String(guild.rules_channel_id) : null,
      publicUpdatesChannelId: guild.public_updates_channel_id ? String(guild.public_updates_channel_id) : null,
      safetyAlertsChannelId: guild.safety_alerts_channel_id ? String(guild.safety_alerts_channel_id) : null,
    },
    roles: normalizedRoles,
    channels: normalizedChannels,
    optional,
    bot: {
      id: botUser?.id ? String(botUser.id) : null,
      username: botUser?.username ? String(botUser.username) : null,
      roleIds: botRoleIds,
      guildPermissionsRaw: basePermissions.toString(),
      guildPermissions: botPermissions,
      administrator,
      canManageGuild: administrator || botPermissions.includes('MANAGE_GUILD'),
      canManageChannels: administrator || botPermissions.includes('MANAGE_CHANNELS'),
      canManageRoles: administrator || botPermissions.includes('MANAGE_ROLES'),
      completeChannelVisibilityGuaranteed: administrator,
    },
  };
}
