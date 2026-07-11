import type { Guild } from "discord.js"
import { z } from "zod"

const discordSnowflakeSchema = z.string().regex(/^\d{17,20}$/)

export const guildSnapshotSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1_024).optional(),
  iconUrl: z.url().optional(),
  iconHash: z.string().max(256).optional(),
  ownerDiscordId: discordSnowflakeSchema.optional(),
  memberCount: z.int().nonnegative(),
  presenceCount: z.int().nonnegative().optional(),
  botJoinedAt: z.int().nonnegative().optional(),
})

export const guildLeftSnapshotSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  name: z.string().trim().min(1).max(100).optional(),
  leftAt: z.int().nonnegative().optional(),
})

export type GuildSnapshot = z.infer<typeof guildSnapshotSchema>
export type GuildLeftSnapshot = z.infer<typeof guildLeftSnapshotSchema>

export function createGuildSnapshot(guild: Guild): GuildSnapshot {
  const iconUrl = guild.iconURL()
  const snapshot: GuildSnapshot = {
    discordGuildId: guild.id,
    name: guild.name,
    ownerDiscordId: guild.ownerId,
    memberCount: guild.memberCount,
  }

  if (guild.description !== null) {
    snapshot.description = guild.description
  }

  if (iconUrl !== null) {
    snapshot.iconUrl = iconUrl
  }

  if (guild.icon !== null) {
    snapshot.iconHash = guild.icon
  }

  if (guild.joinedTimestamp !== null) {
    snapshot.botJoinedAt = guild.joinedTimestamp
  }

  return guildSnapshotSchema.parse(snapshot)
}

export function createGuildLeftSnapshot(guild: Guild): GuildLeftSnapshot {
  return guildLeftSnapshotSchema.parse({
    discordGuildId: guild.id,
    name: guild.name,
    leftAt: Date.now(),
  })
}
