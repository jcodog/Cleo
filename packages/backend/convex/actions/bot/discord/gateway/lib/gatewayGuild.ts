"use node"

import { ConvexError, v } from "convex/values"

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/
const MAX_READY_GUILDS_PER_SYNC = 10_000
const MAX_GUILD_NAME_LENGTH = 100
const MAX_GUILD_DESCRIPTION_LENGTH = 1_024
const MAX_ICON_HASH_LENGTH = 256
const MAX_ICON_URL_LENGTH = 2_048
const ALLOWED_ICON_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
])

export const gatewayGuild = v.object({
  discordGuildId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
  iconHash: v.optional(v.string()),
  ownerDiscordId: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  presenceCount: v.optional(v.number()),
  botJoinedAt: v.optional(v.number()),
})

export type GatewayGuild = {
  discordGuildId: string
  name: string
  description?: string
  iconUrl?: string
  iconHash?: string
  ownerDiscordId?: string
  memberCount?: number
  presenceCount?: number
  botJoinedAt?: number
}

export function assertGatewayGuild(guild: GatewayGuild, now: number): void {
  assertDiscordSnowflake("discordGuildId", guild.discordGuildId)
  assertBoundedString("name", guild.name, MAX_GUILD_NAME_LENGTH)
  assertBoundedOptionalString(
    "description",
    guild.description,
    MAX_GUILD_DESCRIPTION_LENGTH
  )
  assertBoundedOptionalString("iconHash", guild.iconHash, MAX_ICON_HASH_LENGTH)
  assertGatewayIconUrl(guild.iconUrl)

  if (guild.ownerDiscordId !== undefined) {
    assertDiscordSnowflake("ownerDiscordId", guild.ownerDiscordId)
  }

  assertOptionalCount("memberCount", guild.memberCount)
  assertOptionalCount("presenceCount", guild.presenceCount)
  assertOptionalTimestamp("botJoinedAt", guild.botJoinedAt, now)
}

export function assertOptionalGuildName(name: string | undefined): void {
  if (name !== undefined) {
    assertBoundedString("name", name, MAX_GUILD_NAME_LENGTH)
  }
}

export function uniqueGatewayGuilds(guilds: GatewayGuild[]): GatewayGuild[] {
  if (guilds.length > MAX_READY_GUILDS_PER_SYNC) {
    throw new ConvexError({
      code: "TOO_MANY_GUILDS",
      message: "Ready guild sync exceeded the maximum guild batch size.",
    })
  }

  return Array.from(
    guilds
      .reduce((guildsByDiscordId, guild) => {
        guildsByDiscordId.set(guild.discordGuildId, guild)
        return guildsByDiscordId
      }, new Map<string, GatewayGuild>())
      .values()
  )
}

export function assertDiscordSnowflake(field: string, value: string): void {
  if (!DISCORD_SNOWFLAKE_PATTERN.test(value)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_SNOWFLAKE",
      message: `${field} must be a valid Discord snowflake.`,
    })
  }
}

function assertBoundedString(
  field: string,
  value: string,
  maxLength: number
): void {
  if (value.trim().length === 0 || value.length > maxLength) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_METADATA",
      message: `${field} must be non-empty and within Discord metadata limits.`,
    })
  }
}

function assertBoundedOptionalString(
  field: string,
  value: string | undefined,
  maxLength: number
): void {
  if (value !== undefined && value.length > maxLength) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_METADATA",
      message: `${field} exceeds Discord metadata limits.`,
    })
  }
}

function assertGatewayIconUrl(iconUrl: string | undefined): void {
  if (iconUrl === undefined) {
    return
  }

  if (iconUrl.length > MAX_ICON_URL_LENGTH) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_METADATA",
      message: "iconUrl exceeds Discord metadata limits.",
    })
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(iconUrl)
  } catch {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_METADATA",
      message: "iconUrl must be a valid URL.",
    })
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !ALLOWED_ICON_HOSTS.has(parsedUrl.hostname)
  ) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_METADATA",
      message: "iconUrl must point to a Discord CDN host.",
    })
  }
}

function assertOptionalCount(field: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_METADATA",
      message: `${field} must be a non-negative integer.`,
    })
  }
}

function assertOptionalTimestamp(
  field: string,
  value: number | undefined,
  now: number
): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value < 0 || value > now)
  ) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_METADATA",
      message: `${field} must be a non-future timestamp.`,
    })
  }
}
