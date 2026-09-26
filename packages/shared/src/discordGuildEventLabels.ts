export const discordGuildEventTypes = [
  "guildMemberAdd",
  "guildMemberRemove",
  "guildBanAdd",
  "guildBanRemove",
  "channelCreate",
  "channelDelete",
  "roleCreate",
  "roleDelete",
  "messageDelete",
] as const

export type DiscordGuildEventType = (typeof discordGuildEventTypes)[number]

export function formatDiscordGuildEventType(
  eventType: DiscordGuildEventType
): string {
  switch (eventType) {
    case "guildMemberAdd":
      return "Member Joined"
    case "guildMemberRemove":
      return "Member Left"
    case "guildBanAdd":
      return "User Banned"
    case "guildBanRemove":
      return "User Unbanned"
    case "channelCreate":
      return "Channel Created"
    case "channelDelete":
      return "Channel Deleted"
    case "roleCreate":
      return "Role Created"
    case "roleDelete":
      return "Role Deleted"
    case "messageDelete":
      return "Message Deleted"
  }
}
