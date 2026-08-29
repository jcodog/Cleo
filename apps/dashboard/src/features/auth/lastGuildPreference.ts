export const LAST_DISCORD_GUILD_COOKIE = "cleo-last-discord-guild"

const DISCORD_GUILD_ID_PATTERN = /^\d{17,20}$/

type LastDiscordGuildPreference = {
  guildId: string
  userId: string
}

export function serializeLastDiscordGuildPreference(
  preference: LastDiscordGuildPreference
): string {
  return encodeURIComponent(JSON.stringify(preference))
}

export function getLastDiscordGuildDashboardPath(
  cookieValue: string | undefined,
  currentUserId: string
): string {
  const preference = parseLastDiscordGuildPreference(cookieValue)

  if (!preference || preference.userId !== currentUserId) {
    return "/dashboard"
  }

  return `/dashboard/${preference.guildId}`
}

function parseLastDiscordGuildPreference(
  cookieValue: string | undefined
): LastDiscordGuildPreference | null {
  if (!cookieValue) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(cookieValue))

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("guildId" in parsed) ||
      !("userId" in parsed) ||
      typeof parsed.guildId !== "string" ||
      typeof parsed.userId !== "string" ||
      !DISCORD_GUILD_ID_PATTERN.test(parsed.guildId)
    ) {
      return null
    }

    return {
      guildId: parsed.guildId,
      userId: parsed.userId,
    }
  } catch {
    return null
  }
}
