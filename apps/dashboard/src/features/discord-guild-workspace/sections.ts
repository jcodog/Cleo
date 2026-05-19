export const DISCORD_GUILD_SECTIONS = [
  "overview",
  "modules",
  "channels",
  "moderation",
  "automation",
  "commands",
  "logs",
  "settings",
] as const

export type DiscordGuildSection = (typeof DISCORD_GUILD_SECTIONS)[number]

export const DISCORD_GUILD_SECTION_TITLES: Record<DiscordGuildSection, string> =
  {
    overview: "Overview",
    modules: "Modules",
    channels: "Channels",
    moderation: "Moderation",
    automation: "Automation",
    commands: "Commands",
    logs: "Logs",
    settings: "Settings",
  }
