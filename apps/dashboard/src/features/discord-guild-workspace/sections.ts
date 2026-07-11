export const DISCORD_GUILD_SECTIONS = [
  "overview",
  "welcome",
  "moderation",
  "support",
  "logs",
  "settings",
] as const

export type DiscordGuildSection = (typeof DISCORD_GUILD_SECTIONS)[number]

export const DISCORD_GUILD_SECTION_TITLES: Record<DiscordGuildSection, string> =
  {
    overview: "Overview",
    welcome: "Welcome",
    moderation: "Moderation",
    support: "Support",
    logs: "Logs",
    settings: "Settings",
  }
