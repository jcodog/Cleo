import {
  isConvexJsonObject,
  isConvexJsonShallowObject,
  type ConvexJsonObject,
  type ConvexJsonShallowObject,
} from "./validators"
import { fetchDiscordJson } from "./discordRestTransport"

const DISCORD_API_BASE_URL = "https://discord.com/api/v10"
const DISCORD_CDN_BASE_URL = "https://cdn.discordapp.com"
const DISCORD_GUILD_TEXT_CHANNEL = 0
const DISCORD_GUILD_ANNOUNCEMENT_CHANNEL = 5
const DISCORD_ANNOUNCEMENT_THREAD = 10
const DISCORD_PUBLIC_THREAD = 11
const DISCORD_PRIVATE_THREAD = 12
const DISCORD_GUILD_FORUM_CHANNEL = 15
const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n
const DISCORD_EPOCH = 1420070400000n
const DISCORD_NOT_INSTALLED_STATUSES = [403, 404] as const

type DiscordApiUnavailableReason =
  "discordApiUnavailable" | "discordGuildScopeUnavailable"

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

type DiscordBotGuild = {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  owner_id?: string
  approximate_member_count?: number
  approximate_presence_count?: number
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
  changes?: ConvexJsonObject[]
  options?: ConvexJsonShallowObject
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
  canInstall: boolean
}

export type DiscordPendingChannel = {
  discordChannelId: string
  name: string
  type: "text" | "announcement"
  position?: number
}

export type DiscordConfigurationChannel = Omit<
  DiscordPendingChannel,
  "type"
> & {
  type: DiscordPendingChannel["type"] | "thread" | "forum"
}

export type DiscordBotGuildSummary = {
  discordGuildId: string
  name: string
  description?: string
  iconHash?: string
  iconUrl?: string
  ownerDiscordId?: string
  memberCount?: number
  presenceCount?: number
}

export type DiscordBotRestUnavailableReason =
  "discordApiUnavailable" | "discordRestDeniedAccess"

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
  changes?: ConvexJsonObject[]
  options?: ConvexJsonShallowObject
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
  const response = await fetchDiscordJson(
    `${DISCORD_API_BASE_URL}/users/@me/guilds?with_counts=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (response === null) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

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

  if (!isDiscordUserGuilds(response.json)) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  return {
    status: "ready",
    guilds: response.json.map((guild) => {
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
        canManage: canManageInstalledGuild({
          isOwner: guild.owner,
          permissions,
        }),
        canInstall: canInstallBotToGuild({
          isOwner: guild.owner,
          permissions,
        }),
      }
    }),
  }
}

export async function fetchDiscordBotGuilds(botToken: string): Promise<
  | {
      status: "ready"
      guilds: DiscordBotGuildSummary[]
    }
  | {
      status: "unavailable"
      reason: DiscordBotRestUnavailableReason
    }
> {
  const guilds: DiscordBotGuildSummary[] = []
  let after: string | undefined

  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({
      limit: "200",
      with_counts: "true",
    })

    if (after !== undefined) {
      params.set("after", after)
    }

    const response = await fetchDiscordJson(
      `${DISCORD_API_BASE_URL}/users/@me/guilds?${params}`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    )

    if (response === null) {
      return {
        status: "unavailable",
        reason: "discordApiUnavailable",
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: "unavailable",
        reason: "discordRestDeniedAccess",
      }
    }

    if (!response.ok) {
      return {
        status: "unavailable",
        reason: "discordApiUnavailable",
      }
    }

    if (!isDiscordUserGuilds(response.json)) {
      return {
        status: "unavailable",
        reason: "discordApiUnavailable",
      }
    }

    guilds.push(
      ...response.json.map((guild) => {
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
        }
      })
    )

    if (response.json.length < 200) {
      break
    }

    after = response.json[response.json.length - 1]?.id

    if (after === undefined) {
      break
    }
  }

  return {
    status: "ready",
    guilds,
  }
}

type DiscordGuildChannelsResult<TChannel> =
  | {
      status: "ready"
      channels: TChannel[]
    }
  | {
      status: "notInstalled"
    }
  | {
      status: "unavailable"
      reason: DiscordBotRestUnavailableReason
    }

export function fetchDiscordGuildChannels(
  discordGuildId: string,
  botToken: string
): Promise<DiscordGuildChannelsResult<DiscordPendingChannel>>
export function fetchDiscordGuildChannels(
  discordGuildId: string,
  botToken: string,
  options: { includeSupportTargets: true }
): Promise<DiscordGuildChannelsResult<DiscordConfigurationChannel>>
export async function fetchDiscordGuildChannels(
  discordGuildId: string,
  botToken: string,
  options: { includeSupportTargets?: boolean } = {}
): Promise<DiscordGuildChannelsResult<DiscordConfigurationChannel>> {
  const response = await fetchDiscordJson(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}/channels`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    },
    {
      expectedErrorStatuses: DISCORD_NOT_INSTALLED_STATUSES,
    }
  )

  if (response === null) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  if (response.status === 401) {
    return {
      status: "unavailable",
      reason: "discordRestDeniedAccess",
    }
  }

  if (response.status === 403 || response.status === 404) {
    return { status: "notInstalled" }
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  if (!isDiscordChannels(response.json)) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  return {
    status: "ready",
    channels: response.json
      .filter(
        (channel) =>
          channel.name &&
          (channel.type === DISCORD_GUILD_TEXT_CHANNEL ||
            channel.type === DISCORD_GUILD_ANNOUNCEMENT_CHANNEL ||
            (options.includeSupportTargets === true &&
              (channel.type === DISCORD_ANNOUNCEMENT_THREAD ||
                channel.type === DISCORD_PUBLIC_THREAD ||
                channel.type === DISCORD_PRIVATE_THREAD ||
                channel.type === DISCORD_GUILD_FORUM_CHANNEL)))
      )
      .map((channel) => ({
        discordChannelId: channel.id,
        name: channel.name ?? channel.id,
        type: getDiscordChannelType(channel.type),
        ...(channel.position !== undefined
          ? { position: channel.position }
          : {}),
      }))
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0)),
  }
}

function getDiscordChannelType(
  type: number
): DiscordConfigurationChannel["type"] {
  if (type === DISCORD_GUILD_ANNOUNCEMENT_CHANNEL) {
    return "announcement"
  }

  if (type === DISCORD_GUILD_FORUM_CHANNEL) {
    return "forum"
  }

  if (
    type === DISCORD_ANNOUNCEMENT_THREAD ||
    type === DISCORD_PUBLIC_THREAD ||
    type === DISCORD_PRIVATE_THREAD
  ) {
    return "thread"
  }

  return "text"
}

export async function fetchDiscordBotGuild(
  discordGuildId: string,
  botToken: string
): Promise<
  | {
      status: "ready"
      guild: DiscordBotGuildSummary
    }
  | {
      status: "notInstalled"
    }
  | {
      status: "unavailable"
      reason: DiscordBotRestUnavailableReason
    }
> {
  const response = await fetchDiscordJson(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}?with_counts=true`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    },
    {
      expectedErrorStatuses: DISCORD_NOT_INSTALLED_STATUSES,
    }
  )

  if (response === null) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  if (response.status === 401) {
    return {
      status: "unavailable",
      reason: "discordRestDeniedAccess",
    }
  }

  if (response.status === 403 || response.status === 404) {
    return { status: "notInstalled" }
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  if (!isDiscordBotGuild(response.json)) {
    return {
      status: "unavailable",
      reason: "discordApiUnavailable",
    }
  }

  const iconHash = response.json.icon ?? undefined

  return {
    status: "ready",
    guild: {
      discordGuildId: response.json.id,
      name: response.json.name,
      ...(response.json.description
        ? { description: response.json.description }
        : {}),
      ...(iconHash !== undefined ? { iconHash } : {}),
      ...(iconHash !== undefined
        ? { iconUrl: getDiscordGuildIconUrl(response.json.id, iconHash) }
        : {}),
      ...(response.json.owner_id !== undefined
        ? { ownerDiscordId: response.json.owner_id }
        : {}),
      ...(response.json.approximate_member_count !== undefined
        ? { memberCount: response.json.approximate_member_count }
        : {}),
      ...(response.json.approximate_presence_count !== undefined
        ? { presenceCount: response.json.approximate_presence_count }
        : {}),
    },
  }
}

export async function fetchDiscordGuildRoles(
  discordGuildId: string,
  botToken: string
): Promise<DiscordGuildRole[] | null> {
  const response = await fetchDiscordJson(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}/roles`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  )

  if (response === null || !response.ok) {
    return null
  }

  if (!isDiscordRoles(response.json)) {
    return null
  }

  return response.json
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

  const response = await fetchDiscordJson(
    `${DISCORD_API_BASE_URL}/guilds/${discordGuildId}/audit-logs?${params}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  )

  if (response === null || !response.ok) {
    return null
  }

  if (!isDiscordAuditLogResponse(response.json)) {
    return null
  }

  const usersById = new Map(
    (response.json.users ?? []).map((user) => [
      user.id,
      getDiscordUserDisplayName(user),
    ])
  )

  return response.json.audit_log_entries.map((entry) => {
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

export function canManageInstalledGuild({
  isOwner,
  permissions,
}: {
  isOwner?: boolean
  permissions?: string
}) {
  return Boolean(isOwner) || hasManageGuildPermission(permissions)
}

// Discord requires Manage Server to authorize a guild install. Owners and
// administrators satisfy that requirement through their effective permissions.
export function canInstallBotToGuild({
  isOwner,
  permissions,
}: {
  isOwner?: boolean
  permissions?: string
}) {
  return canManageInstalledGuild({
    isOwner,
    permissions,
  })
}

export function hasAdministratorPermission(permissions: string | undefined) {
  if (permissions === undefined) {
    return false
  }

  try {
    const permissionBits = BigInt(permissions)

    return (permissionBits & DISCORD_PERMISSION_ADMINISTRATOR) !== 0n
  } catch {
    return false
  }
}

export function hasManageGuildPermission(permissions: string | undefined) {
  if (permissions === undefined) {
    return false
  }

  try {
    const permissionBits = BigInt(permissions)

    return (
      hasAdministratorPermission(permissions) ||
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

function isDiscordBotGuild(value: unknown): value is DiscordBotGuild {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    (!("description" in value) ||
      typeof value.description === "string" ||
      value.description === null) &&
    (!("icon" in value) ||
      typeof value.icon === "string" ||
      value.icon === null) &&
    (!("owner_id" in value) || typeof value.owner_id === "string") &&
    (!("approximate_member_count" in value) ||
      typeof value.approximate_member_count === "number") &&
    (!("approximate_presence_count" in value) ||
      typeof value.approximate_presence_count === "number")
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
    (!("changes" in value) ||
      (Array.isArray(value.changes) &&
        value.changes.every(isConvexJsonObject))) &&
    (!("options" in value) || isConvexJsonShallowObject(value.options))
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
    return 0
  }
}
