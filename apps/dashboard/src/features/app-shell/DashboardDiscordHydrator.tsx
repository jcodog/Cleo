"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import { pollDiscordDiscovery } from "../add-server/pollDiscordDiscovery"
import { usePathname } from "next/navigation"
import { Button } from "@workspace/ui/components/button"

export type DashboardDiscordSyncStatus = "idle" | "syncing" | "ready" | "error"

export function DashboardDiscordHydrator({
  onStatusChange,
  retryToken = 0,
}: {
  onStatusChange?: (status: DashboardDiscordSyncStatus) => void
  retryToken?: number
}) {
  const pathname = usePathname()
  const identity = useQuery(api.queries.dashboard.account.discordIdentity.get)
  const progress = useQuery(api.communityRoles.refreshProgress)
  const [refreshTick, setRefreshTick] = useState(0)
  const [failed, setFailed] = useState(false)
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
      !isAuthenticated ||
      identity === undefined ||
      progress === undefined
    ) {
      return
    }

    const syncKey = `cleo:dashboard-discord-sync:${userId}:${identity?.providerAccountId ?? "unlinked"}`

    if (activeSyncKey.current === syncKey) {
      return
    }

    const cachedAt = Number(sessionStorage.getItem(syncKey))
    if (
      progress?.state === "complete" &&
      progress.observedAt === cachedAt &&
      cachedAt > Date.now() - 300000 &&
      cachedAt <= Date.now()
    ) {
      onStatusChange?.("ready")
      const timer = setTimeout(
        () => setRefreshTick((value) => value + 1),
        Math.max(1, cachedAt + 300000 - Date.now())
      )
      return () => clearTimeout(timer)
    }

    activeSyncKey.current = syncKey
    const controller = new AbortController()
    onStatusChange?.("syncing")

    void syncLinkedAccounts({})
      .then((result) => {
        if (result.status !== "ready") {
          throw new Error("Linked account synchronisation is unavailable.")
        }

        return pollDiscordDiscovery(
          () => syncDashboardGuilds({}),
          controller.signal
        )
      })
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.status === "ready") {
          setFailed(false)
          sessionStorage.setItem(syncKey, String(result.verifiedAt))
          onStatusChange?.("ready")
          setRefreshTick((value) => value + 1)
          return
        }

        throw new Error("Discord server synchronisation is unavailable.")
      })
      .catch(() => {
        if (controller.signal.aborted) return
        activeSyncKey.current = null
        setFailed(true)
        onStatusChange?.("error")
      })
    return () => {
      controller.abort()
      activeSyncKey.current = null
    }
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
    identity,
    progress,
    refreshTick,
  ])

  return failed && !onStatusChange ? (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
    >
      Discord server verification is unavailable. Access remains restricted
      until verification completes.
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setFailed(false)
          setRefreshTick((value) => value + 1)
        }}
      >
        Retry verification
      </Button>
    </div>
  ) : null
}
