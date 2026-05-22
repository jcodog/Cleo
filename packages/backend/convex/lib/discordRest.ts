const DISCORD_API_BASE_URL = "https://discord.com/api/v10"
const DISCORD_CDN_BASE_URL = "https://cdn.discordapp.com"
const DISCORD_GUILD_TEXT_CHANNEL = 0
const DISCORD_GUILD_ANNOUNCEMENT_CHANNEL = 5
const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n
const DISCORD_EPOCH = 1420070400000n

type DiscordApiUnavailableReason =
  | "discordApiUnavailable"
  | "discordGuildScopeUnavailable"

type DiscordUserGuild = {
  id: string
  name: string
  icon?: string | null
  owner?: boolean
  permissions?: string
  approximate_member_count?: number
  approximate_presence_count?: number
}

type DiscordChannel = {
  id: string
  name?: string | null
  type: number
  position?: number
}

type DiscordRole = {
  id: string
  name: string
  permissions: string
  position: number
  managed: boolean
}

type DiscordAuditLogUser = {
  id: string
  username?: string
  global_name?: string | null
}

type DiscordAuditLogEntry = {
  id: string
  action_type: number
  target_id?: string | null
  user_id?: string | null
  reason?: string | null
  changes?: unknown[]
  options?: Record<string, unknown>
}

type DiscordAuditLogResponse = {
  audit_log_entries: DiscordAuditLogEntry[]
  users?: DiscordAuditLogUser[]
}

export type DiscordManageableGuild = {
  discordGuildId: string
  name: string
  iconHash?: string
  iconUrl?: string
  memberCount?: number
  presenceCount?: number
  isOwner?: boolean
  permissions?: string
  canManage: boolean
}

export type DiscordPendingChannel = {
  discordChannelId: string
  name: string
  type: "text" | "announcement"
  position?: number
}

export type DiscordGuildRole = {
  discordRoleId: string
  name: string
  permissions: string
  position: number
  managed: boolean
}

export type DiscordGuildAuditLogEntry = {
  discordAuditLogId: string
  actionType: number
  summary: string
  actorDiscordUserId?: string
  actorDisplayName?: string
  targetDiscordId?: string
  reason?: string
  changes?: unknown[]
  options?: Record<string, unknown>
  occurredAt: number
}

export async function fetchDiscordCurrentUserGuilds(
  accessToken: string
): Promise<
  | {
      status: "ready"
      guilds: DiscordManageableGuild[]
    }
  | {
      status: "unavailable"
      reason: DiscordApiUnavailableReason
    }
> {
  const response = await fetch(
    `${DISCORD_API_BASE_URL}/users/@me/guilds?with_counts=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (response.status === 401 || response.status === 403) {
    return {
      status: "unavailable",
      reason: "discordGuildScopeUnavailable",
    }
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  const json: unknown = await response.json()

  if (!isDiscordUserGuilds(json)) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  return {
    status: "ready",
    guilds: json.map((guild) => {
      const permissions = guild.permissions
      const iconHash = guild.icon ?? undefined

      return {
        discordGuildId: guild.id,
        name: guild.name,
        ...(iconHash !== undefined ? { iconHash } : {}),
        ...(iconHash !== undefined
          ? { iconUrl: getDiscordGuildIconUrl(guild.id, iconHash) }
          : {}),
        ...(guild.approximate_member_count !== undefined
          ? { memberCount: guild.approximate_member_count }
          : {}),
        ...(guild.approximate_presence_count !== undefined
          ? { presenceCount: guild.approximate_presence_count }
          : {}),
        ...(guild.owner !== undefined ? { isOwner: guild.owner } : {}),
        ...(permissions !== undefined ? { permissions } : {}),
        canManage:
          Boolean(guild.owner) || hasManageGuildPermission(permissions),
      }
    }),
  }
}

export async function fetchDiscordGuildChannels(
  discordGuildId: string,
  botToken: string
): Promise<DiscordPendingChannel[] | null> {
  const response = await fetch(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}/channels`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  )

  if (!response.ok) {
    return null
  }

  const json: unknown = await response.json()

  if (!isDiscordChannels(json)) {
    return null
  }

  return json
    .filter(
      (channel) =>
        channel.name &&
        (channel.type === DISCORD_GUILD_TEXT_CHANNEL ||
          channel.type === DISCORD_GUILD_ANNOUNCEMENT_CHANNEL)
    )
    .map((channel) => ({
      discordChannelId: channel.id,
      name: channel.name ?? channel.id,
      type:
        channel.type === DISCORD_GUILD_ANNOUNCEMENT_CHANNEL
          ? ("announcement" as const)
          : ("text" as const),
      ...(channel.position !== undefined ? { position: channel.position } : {}),
    }))
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
}

export async function fetchDiscordGuildRoles(
  discordGuildId: string,
  botToken: string
): Promise<DiscordGuildRole[] | null> {
  const response = await fetch(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}/roles`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  )

  if (!response.ok) {
    return null
  }

  const json: unknown = await response.json()

  if (!isDiscordRoles(json)) {
    return null
  }

  return json
    .map((role) => ({
      discordRoleId: role.id,
      name: role.name,
      permissions: role.permissions,
      position: role.position,
      managed: role.managed,
    }))
    .sort((left, right) => right.position - left.position)
}

export async function fetchDiscordGuildAuditLogs({
  after,
  before,
  botToken,
  discordGuildId,
  limit,
}: {
  after?: string
  before?: string
  botToken: string
  discordGuildId: string
  limit: number
}): Promise<DiscordGuildAuditLogEntry[] | null> {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), 100)),
  })

  if (after !== undefined) {
    params.set("after", after)
  }

  if (before !== undefined) {
    params.set("before", before)
  }

  const response = await fetch(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}/audit-logs?${params}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  )

  if (!response.ok) {
    return null
  }

  const json: unknown = await response.json()

  if (!isDiscordAuditLogResponse(json)) {
    return null
  }

  const usersById = new Map(
    (json.users ?? []).map((user) => [user.id, getDiscordUserDisplayName(user)])
  )

  return json.audit_log_entries.map((entry) => {
    const actorDiscordUserId = entry.user_id ?? undefined
    const targetDiscordId = entry.target_id ?? undefined
    const reason = entry.reason ?? undefined

    return {
      discordAuditLogId: entry.id,
      actionType: entry.action_type,
      summary: getAuditLogSummary(entry),
      ...(actorDiscordUserId !== undefined ? { actorDiscordUserId } : {}),
      ...(actorDiscordUserId !== undefined &&
      usersById.get(actorDiscordUserId) !== undefined
        ? { actorDisplayName: usersById.get(actorDiscordUserId) }
        : {}),
      ...(targetDiscordId !== undefined ? { targetDiscordId } : {}),
      ...(reason !== undefined ? { reason } : {}),
      ...(entry.changes !== undefined ? { changes: entry.changes } : {}),
      ...(entry.options !== undefined ? { options: entry.options } : {}),
      occurredAt: getTimestampFromSnowflake(entry.id),
    }
  })
}

export function hasManageGuildPermission(permissions: string | undefined) {
  if (permissions === undefined) {
    return false
  }

  try {
    const permissionBits = BigInt(permissions)

    return (
      (permissionBits & DISCORD_PERMISSION_ADMINISTRATOR) !== 0n ||
      (permissionBits & DISCORD_PERMISSION_MANAGE_GUILD) !== 0n
    )
  } catch {
    return false
  }
}

function getDiscordGuildIconUrl(guildId: string, iconHash: string) {
  const extension = iconHash.startsWith("a_") ? "gif" : "png"

  return `${DISCORD_CDN_BASE_URL}/icons/${guildId}/${iconHash}.${extension}?size=64`
}

function isDiscordUserGuilds(value: unknown): value is DiscordUserGuild[] {
  return Array.isArray(value) && value.every(isDiscordUserGuild)
}

function isDiscordUserGuild(value: unknown): value is DiscordUserGuild {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    (!("icon" in value) ||
      typeof value.icon === "string" ||
      value.icon === null) &&
    (!("owner" in value) || typeof value.owner === "boolean") &&
    (!("permissions" in value) || typeof value.permissions === "string") &&
    (!("approximate_member_count" in value) ||
      typeof value.approximate_member_count === "number") &&
    (!("approximate_presence_count" in value) ||
      typeof value.approximate_presence_count === "number")
  )
}

function isDiscordChannels(value: unknown): value is DiscordChannel[] {
  return (
    Array.isArray(value) &&
    value.every(
      (channel) =>
        typeof channel === "object" &&
        channel !== null &&
        "id" in channel &&
        typeof channel.id === "string" &&
        "type" in channel &&
        typeof channel.type === "number" &&
        (!("name" in channel) ||
          typeof channel.name === "string" ||
          channel.name === null) &&
        (!("position" in channel) || typeof channel.position === "number")
    )
  )
}

function isDiscordRoles(value: unknown): value is DiscordRole[] {
  return (
    Array.isArray(value) &&
    value.every(
      (role) =>
        typeof role === "object" &&
        role !== null &&
        "id" in role &&
        typeof role.id === "string" &&
        "name" in role &&
        typeof role.name === "string" &&
        "permissions" in role &&
        typeof role.permissions === "string" &&
        "position" in role &&
        typeof role.position === "number" &&
        "managed" in role &&
        typeof role.managed === "boolean"
    )
  )
}

function isDiscordAuditLogResponse(
  value: unknown
): value is DiscordAuditLogResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "audit_log_entries" in value &&
    Array.isArray(value.audit_log_entries) &&
    value.audit_log_entries.every(isDiscordAuditLogEntry) &&
    (!("users" in value) ||
      (Array.isArray(value.users) && value.users.every(isDiscordAuditLogUser)))
  )
}

function isDiscordAuditLogEntry(value: unknown): value is DiscordAuditLogEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "action_type" in value &&
    typeof value.action_type === "number" &&
    (!("target_id" in value) ||
      typeof value.target_id === "string" ||
      value.target_id === null) &&
    (!("user_id" in value) ||
      typeof value.user_id === "string" ||
      value.user_id === null) &&
    (!("reason" in value) ||
      typeof value.reason === "string" ||
      value.reason === null) &&
    (!("changes" in value) || Array.isArray(value.changes)) &&
    (!("options" in value) || isObjectRecord(value.options))
  )
}

function isDiscordAuditLogUser(value: unknown): value is DiscordAuditLogUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    (!("username" in value) || typeof value.username === "string") &&
    (!("global_name" in value) ||
      typeof value.global_name === "string" ||
      value.global_name === null)
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getDiscordUserDisplayName(user: DiscordAuditLogUser): string {
  return user.global_name ?? user.username ?? user.id
}

function getAuditLogSummary(entry: DiscordAuditLogEntry): string {
  const actionLabel = getAuditLogActionLabel(entry.action_type)
  const target = entry.target_id ? ` for ${entry.target_id}` : ""

  return `${actionLabel}${target}`
}

function getAuditLogActionLabel(actionType: number): string {
  switch (actionType) {
    case 1:
      return "Server settings updated"
    case 10:
      return "Channel created"
    case 11:
      return "Channel updated"
    case 12:
      return "Channel deleted"
    case 20:
      return "Member kicked"
    case 22:
      return "Member banned"
    case 23:
      return "Member unbanned"
    case 24:
      return "Member updated"
    case 25:
      return "Member role updated"
    case 30:
      return "Role created"
    case 31:
      return "Role updated"
    case 32:
      return "Role deleted"
    case 72:
      return "Message deleted"
    case 73:
      return "Messages bulk deleted"
    case 74:
      return "Message pinned"
    case 75:
      return "Message unpinned"
    default:
      return `Discord audit action ${actionType}`
  }
}

function getTimestampFromSnowflake(snowflake: string): number {
  try {
    return Number((BigInt(snowflake) >> 22n) + DISCORD_EPOCH)
  } catch {
    return Date.now()
  }
}
