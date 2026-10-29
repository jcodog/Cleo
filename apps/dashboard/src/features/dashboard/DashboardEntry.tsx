"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { useConvexAuth, useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { useAppShellStore } from "@/components/stores/app-shell-store"
import { getDashboardGuildSelection } from "@/features/app-shell/dashboardGuildSelection"
import Link from "next/link"

/** Resume only after the current account's server verification has completed. */
export function DashboardEntry() {
  const { userId, isLoaded } = useAuth()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const router = useRouter()
  const directory = useQuery(
    api.queries.dashboard.discord.guilds.directory.list,
    isAuthenticated ? {} : "skip"
  )
  const storedDiscordGuildId = useAppShellStore((state) =>
    state.selectionClerkUserId === userId
      ? state.selectedDiscordGuildId
      : undefined
  )
  useEffect(() => {
    if (
      !isLoaded ||
      !userId ||
      isLoading ||
      !isAuthenticated ||
      directory?.clerkUserId !== userId
    )
      return
    if (directory.status === "ready" || directory.status === "missingDiscord") {
      const selection = getDashboardGuildSelection({
        manageableGuilds: directory.guilds.filter((guild) => guild.verified),
        routeDiscordGuildId: undefined,
        storedDiscordGuildId,
      })
      router.replace(selection.safeDashboardPath)
    }
  }, [
    directory,
    isAuthenticated,
    isLoaded,
    isLoading,
    router,
    storedDiscordGuildId,
    userId,
  ])
  return (
    <div className="space-y-3 py-6 text-sm text-muted-foreground">
      <p role="status">
        {directory?.status === "unavailable" || directory?.status === "expired"
          ? "Discord verification is unavailable. Your saved server will be checked when verification recovers."
          : "Checking your Discord servers…"}
      </p>
      <Link
        href="/dashboard/servers"
        className="text-foreground underline underline-offset-4"
      >
        View all servers
      </Link>
    </div>
  )
}
