export const DISCORD_GUILD_SECTIONS = [
  "overview",
  "welcome",
  "live-notifications",
  "moderation",
  "support",
  "logs",
  "premium",
  "settings",
] as const

export type DiscordGuildSection = (typeof DISCORD_GUILD_SECTIONS)[number]

export const DISCORD_GUILD_SECTION_TITLES: Record<DiscordGuildSection, string> =
  {
    overview: "Overview",
    welcome: "Welcome",
    "live-notifications": "Live notifications",
    moderation: "Moderation",
    support: "Support",
    logs: "Logs",
    premium: "Premium Guild",
    settings: "Settings",
  }
