"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@clerk/nextjs"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { useAction, useConvexAuth } from "convex/react"
import { usePathname } from "next/navigation"

export type DashboardDiscordSyncStatus = "idle" | "syncing" | "ready" | "error"

export function DashboardDiscordHydrator({
  onStatusChange,
  retryToken = 0,
}: {
  onStatusChange?: (status: DashboardDiscordSyncStatus) => void
  retryToken?: number
}) {
  const pathname = usePathname()
  const { isLoaded, isSignedIn, userId } = useAuth()
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth()
  const syncLinkedAccounts = useAction(
    api.actions.dashboard.account.syncLinkedAccounts.sync
  )
  const syncDashboardGuilds = useAction(
    api.actions.dashboard.discord.guilds.syncDashboardGuilds.sync
  )
  const activeSyncKey = useRef<string | null>(null)

  useEffect(() => {
    if (
      (!pathname.startsWith("/dashboard") && pathname !== "/onboarding") ||
      !isLoaded ||
      !isSignedIn ||
      !userId ||
      isConvexAuthLoading ||
      !isAuthenticated
    ) {
      return
    }

    const syncKey = `cleo:dashboard-discord-sync:${userId}`

    if (activeSyncKey.current === syncKey) {
      return
    }

    if (sessionStorage.getItem(syncKey) === "ready") {
      onStatusChange?.("ready")
      return
    }

    activeSyncKey.current = syncKey
    onStatusChange?.("syncing")

    void syncLinkedAccounts({})
      .then((result) => {
        if (result.status !== "ready") {
          throw new Error("Linked account synchronisation is unavailable.")
        }

        return syncDashboardGuilds({})
      })
      .then((result) => {
        if (result.status === "ready") {
          sessionStorage.setItem(syncKey, "ready")
          onStatusChange?.("ready")
          return
        }

        throw new Error("Discord server synchronisation is unavailable.")
      })
      .catch(() => {
        activeSyncKey.current = null
        onStatusChange?.("error")
      })
  }, [
    isAuthenticated,
    isConvexAuthLoading,
    isLoaded,
    isSignedIn,
    pathname,
    onStatusChange,
    retryToken,
    syncDashboardGuilds,
    syncLinkedAccounts,
    userId,
  ])

  return null
}
