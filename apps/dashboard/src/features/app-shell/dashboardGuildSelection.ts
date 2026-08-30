export type ManageableGuildIdentity = {
  discordGuildId: string
  lastOpenedAt?: number
}

export type DashboardGuildSelection = {
  activeDiscordGuildId: string | undefined
  invalidRouteGuildId: string | undefined
  safeDashboardPath: string
}

export function getDashboardGuildSelection({
  manageableGuilds,
  routeDiscordGuildId,
  storedDiscordGuildId,
}: {
  manageableGuilds: ManageableGuildIdentity[] | undefined
  routeDiscordGuildId: string | undefined
  storedDiscordGuildId: string | undefined
}): DashboardGuildSelection {
  if (manageableGuilds === undefined) {
    return {
      activeDiscordGuildId: undefined,
      invalidRouteGuildId: undefined,
      safeDashboardPath: "/dashboard",
    }
  }

  const manageableIds = new Set(
    manageableGuilds.map((guild) => guild.discordGuildId)
  )
  const routeGuildIsManageable =
    routeDiscordGuildId !== undefined && manageableIds.has(routeDiscordGuildId)
  const storedGuildIsManageable =
    storedDiscordGuildId !== undefined &&
    manageableIds.has(storedDiscordGuildId)
  const mostRecentlyOpenedGuild = manageableGuilds.reduce<
    ManageableGuildIdentity | undefined
  >((mostRecent, guild) => {
    if (guild.lastOpenedAt === undefined) {
      return mostRecent
    }

    if (
      mostRecent?.lastOpenedAt === undefined ||
      guild.lastOpenedAt > mostRecent.lastOpenedAt
    ) {
      return guild
    }

    return mostRecent
  }, undefined)
  const activeDiscordGuildId = routeGuildIsManageable
    ? routeDiscordGuildId
    : storedGuildIsManageable
      ? storedDiscordGuildId
      : mostRecentlyOpenedGuild?.discordGuildId

  return {
    activeDiscordGuildId,
    invalidRouteGuildId:
      routeDiscordGuildId !== undefined && !routeGuildIsManageable
        ? routeDiscordGuildId
        : undefined,
    safeDashboardPath: activeDiscordGuildId
      ? `/dashboard/${activeDiscordGuildId}`
      : "/dashboard",
  }
}
