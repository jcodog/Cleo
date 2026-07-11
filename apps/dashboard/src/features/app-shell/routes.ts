import type { AppShellPlatform } from "@/components/stores/app-shell-store"

const DASHBOARD_RESERVED_SEGMENTS = new Set(["add-server", "staff"])
export const RELEASE_PLATFORMS = ["discord"] as const

export type AppShellArea = AppShellPlatform | "staff"

export function getAppShellAreaFromPathname(pathname: string): AppShellArea {
  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    return "staff"
  }

  if (pathname === "/kick" || pathname.startsWith("/kick/")) {
    return "kick"
  }

  if (pathname === "/twitch" || pathname.startsWith("/twitch/")) {
    return "twitch"
  }

  return "discord"
}

export function getRouteDiscordGuildId(pathname: string): string | undefined {
  const [, section, guildId] = pathname.split("/")

  if (
    section !== "dashboard" ||
    !guildId ||
    DASHBOARD_RESERVED_SEGMENTS.has(guildId)
  ) {
    return undefined
  }

  return guildId
}
