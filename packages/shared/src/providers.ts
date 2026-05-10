export const LINKED_PROVIDERS = ["discord", "kick", "twitch", "github"] as const

export const DISCORD_VERIFICATION_SOURCES = [
  "discord-bot",
  "discord-oauth",
  "manual",
] as const

export type LinkedProvider = (typeof LINKED_PROVIDERS)[number]
export type DiscordVerificationSource =
  (typeof DISCORD_VERIFICATION_SOURCES)[number]
