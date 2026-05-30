import type { GuildConfig } from "../types"

export const MODULE_FIELDS = [
  {
    key: "aiEnabled",
    title: "AI Assistant",
    description:
      "Allow Cleo assistant command responses when runtime support is available.",
    defaultValue: false,
  },
  {
    key: "moderationEnabled",
    title: "Moderation",
    description: "Store whether moderation should be active for the server.",
    defaultValue: false,
  },
  {
    key: "welcomeEnabled",
    title: "Welcome",
    description: "Store whether welcome automation should run for new members.",
    defaultValue: false,
  },
  {
    key: "loggingEnabled",
    title: "Logging",
    description:
      "Store whether configured system and bot events should be logged.",
    defaultValue: false,
  },
] as const

export type ModuleKey = (typeof MODULE_FIELDS)[number]["key"]
export type ModuleValues = Record<ModuleKey, boolean>

export const CHANNEL_FIELDS = [
  {
    key: "logChannelId",
    title: "Log Channel ID",
    description: "General event logging destination.",
  },
  {
    key: "modLogChannelId",
    title: "Mod Log Channel ID",
    description: "Moderation action logging destination.",
  },
  {
    key: "welcomeChannelId",
    title: "Welcome Channel ID",
    description: "Welcome message destination.",
  },
  {
    key: "updatesChannelId",
    title: "Updates Channel ID",
    description: "Product or server update destination.",
  },
  {
    key: "announcementChannelId",
    title: "Announcement Channel ID",
    description: "Announcement destination.",
  },
] as const

export type ChannelKey = (typeof CHANNEL_FIELDS)[number]["key"]
export type ChannelValues = Record<ChannelKey, string>

export const MODERATION_CHANNEL_FIELDS = [
  CHANNEL_FIELDS[1],
  CHANNEL_FIELDS[0],
] as const
export const AUTOMATION_CHANNEL_FIELDS = [
  CHANNEL_FIELDS[2],
  CHANNEL_FIELDS[3],
  CHANNEL_FIELDS[4],
] as const

export function getModuleValues(config: GuildConfig | null): ModuleValues {
  return {
    aiEnabled: config?.aiEnabled ?? false,
    moderationEnabled: config?.moderationEnabled ?? false,
    welcomeEnabled: config?.welcomeEnabled ?? false,
    loggingEnabled: config?.loggingEnabled ?? false,
  }
}

export function getChannelValues(config: GuildConfig | null): ChannelValues {
  return {
    logChannelId: config?.logChannelId ?? "",
    modLogChannelId: config?.modLogChannelId ?? "",
    welcomeChannelId: config?.welcomeChannelId ?? "",
    updatesChannelId: config?.updatesChannelId ?? "",
    announcementChannelId: config?.announcementChannelId ?? "",
  }
}

export function getModuleItems(
  config: GuildConfig | null
): { label: string }[] {
  if (!config) {
    return []
  }

  return MODULE_FIELDS.filter((module) => config[module.key]).map((module) => ({
    label: module.title,
  }))
}

export function getConfiguredChannelItems(
  config: GuildConfig | null
): { label: string; value: string }[] {
  if (!config) {
    return []
  }

  return CHANNEL_FIELDS.flatMap((channel) => {
    const value = config[channel.key]

    return value ? [{ label: channel.title, value }] : []
  })
}

export function toOptionalChannelValue(value: string): string | null {
  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}
