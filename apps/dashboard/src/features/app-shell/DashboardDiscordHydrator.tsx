"use client"

import { useEffect, useEffectEvent, useState } from "react"
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
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth()
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth()
  const syncLinkedAccounts = useAction(
    api.actions.dashboard.account.syncLinkedAccounts.sync
  )
  const syncDashboardGuilds = useAction(
    api.actions.dashboard.discord.guilds.syncDashboardGuilds.sync
  )
  const isDiscordPage =
    pathname.startsWith("/dashboard") || pathname === "/onboarding"
  const queriesReady = identity !== undefined && progress !== undefined
  const discordUserId = identity?.providerAccountId ?? "unlinked"
  const currentProgress = useEffectEvent(() => progress)
  const reportStatus = useEffectEvent((status: DashboardDiscordSyncStatus) =>
    onStatusChange?.(status)
  )

  useEffect(() => {
    if (
      !isDiscordPage ||
      !isLoaded ||
      !isSignedIn ||
      !userId ||
      !sessionId ||
      isConvexAuthLoading ||
      !isAuthenticated ||
      !queriesReady
    ) {
      return
    }

    const syncKey = `cleo:dashboard-discord-sync:${userId}:${sessionId}:${discordUserId}`
    let cachedAt = 0
    try {
      cachedAt = Number(sessionStorage.getItem(syncKey))
    } catch {
      /* Storage is optional. */
    }
    const observation = currentProgress()
    if (
      observation?.state === "complete" &&
      observation.observedAt === cachedAt &&
      cachedAt > Date.now() - 300000 &&
      cachedAt <= Date.now()
    ) {
      reportStatus("ready")
      const timer = setTimeout(
        () => setRefreshTick((value) => value + 1),
        Math.max(1, cachedAt + 300000 - Date.now())
      )
      return () => clearTimeout(timer)
    }

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    reportStatus("syncing")

    void syncLinkedAccounts({})
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.status !== "ready") {
          throw new Error("Linked account synchronisation is unavailable.")
        }

        return pollDiscordDiscovery(
          () => syncDashboardGuilds({}),
          controller.signal
        )
      })
      .then((result) => {
        if (controller.signal.aborted || !result) return
        if (result.status === "ready") {
          setFailed(false)
          try {
            sessionStorage.setItem(syncKey, String(result.verifiedAt))
          } catch {
            /* Storage is optional. */
          }
          reportStatus("ready")
          timer = setTimeout(
            () => setRefreshTick((value) => value + 1),
            Math.max(1000, result.verifiedAt + 300000 - Date.now())
          )
          return
        }

        throw new Error("Discord server synchronisation is unavailable.")
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFailed(true)
        reportStatus("error")
      })
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [
    isAuthenticated,
    isConvexAuthLoading,
    isLoaded,
    isSignedIn,
    isDiscordPage,
    retryToken,
    syncDashboardGuilds,
    syncLinkedAccounts,
    userId,
    sessionId,
    discordUserId,
    queriesReady,
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
