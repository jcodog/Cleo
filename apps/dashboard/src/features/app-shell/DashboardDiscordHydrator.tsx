"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@clerk/nextjs"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { useAction, useConvexAuth } from "convex/react"
import { usePathname } from "next/navigation"

export function DashboardDiscordHydrator() {
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
      !pathname.startsWith("/dashboard") ||
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
      return
    }

    activeSyncKey.current = syncKey

    void syncLinkedAccounts({})
      .then(() => syncDashboardGuilds({}))
      .then((result) => {
        if (result.status === "ready") {
          sessionStorage.setItem(syncKey, "ready")
        }
      })
      .catch(() => {
        activeSyncKey.current = null
      })
  }, [
    isAuthenticated,
    isConvexAuthLoading,
    isLoaded,
    isSignedIn,
    pathname,
    syncDashboardGuilds,
    syncLinkedAccounts,
    userId,
  ])

  return null
}
