type GuildInstallSessionState = {
  state: string
  installSessionExpiresAt?: number
}

export function hasPendingInstall(guilds: GuildInstallSessionState[]): boolean {
  return guilds.some((guild) => guild.state === "pending")
}

export function getNextInstallSessionExpiry({
  activeInstallExpiresAt,
  guilds,
}: {
  activeInstallExpiresAt: number | undefined
  guilds: GuildInstallSessionState[]
}): number | null {
  const expiries = guilds.flatMap((guild) =>
    guild.state === "pending" && guild.installSessionExpiresAt !== undefined
      ? [guild.installSessionExpiresAt]
      : []
  )

  if (activeInstallExpiresAt !== undefined) {
    expiries.push(activeInstallExpiresAt)
  }

  if (expiries.length === 0) {
    return null
  }

  return Math.min(...expiries)
}
