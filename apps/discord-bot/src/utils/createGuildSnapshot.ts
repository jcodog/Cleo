import type { Guild } from "discord.js"

export type GuildSnapshot = {
  id: string
  name: string
  memberCount: number
  ownerId: string
  joinedAt: string | null
  preferredLocale: string | null
}

export function createGuildSnapshot(guild: Guild): GuildSnapshot {
  return {
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    joinedAt: guild.joinedAt?.toISOString() ?? null,
    preferredLocale: guild.preferredLocale ?? null,
  }
}
