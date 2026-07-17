export type ManageableGuildIdentity = {
  discordGuildId: string
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
  const activeDiscordGuildId = routeGuildIsManageable
    ? routeDiscordGuildId
    : storedGuildIsManageable
      ? storedDiscordGuildId
      : undefined

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
