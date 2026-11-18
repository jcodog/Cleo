"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { useConvexAuth, useQuery } from "convex/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { useAppShellStore } from "@/components/stores/app-shell-store"
import { getDashboardGuildSelection } from "@/features/app-shell/dashboardGuildSelection"
import type { FunctionReturnType } from "convex/server"
import { WorkspaceSkeleton } from "@/features/discord-guild-workspace/components/workspace-ui"

type DirectorySnapshot = {
  resolvedAt: number
  value: FunctionReturnType<
    typeof api.queries.dashboard.discord.guilds.directory.list
  >
}

/** Resume only after the current account's server verification has completed. */
export function DashboardEntry({
  initialDirectory,
}: { initialDirectory?: DirectorySnapshot } = {}) {
  const { userId, isLoaded } = useAuth()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const router = useRouter()
  const liveDirectory = useQuery(
    api.queries.dashboard.discord.guilds.directory.list,
    isAuthenticated ? {} : "skip"
  )
  const directory =
    liveDirectory ??
    (initialDirectory && initialDirectory.value.clerkUserId === userId
      ? initialDirectory.value
      : undefined)
  const storedDiscordGuildId = useAppShellStore((state) =>
    state.selectionClerkUserId === userId
      ? state.selectedDiscordGuildId
      : undefined
  )
  useEffect(() => {
    if (liveDirectory === undefined) {
      const snapshotAge = initialDirectory
        ? Date.now() - initialDirectory.resolvedAt
        : Infinity
      if (snapshotAge < 0 || snapshotAge >= 15000) return
    }
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
    liveDirectory,
    initialDirectory,
    isAuthenticated,
    isLoaded,
    isLoading,
    router,
    storedDiscordGuildId,
    userId,
  ])
  const displayGuild =
    directory && directory.clerkUserId === userId
      ? directory.guilds.find(
          (guild) => guild.discordGuildId === storedDiscordGuildId
        )
      : undefined
  const unavailable =
    directory?.status === "unavailable" || directory?.status === "expired"
  return (
    <div className="w-full">
      <p role="status" className="text-sm text-muted-foreground">
        {unavailable
          ? "Discord verification is unavailable. Your saved server will be checked when it recovers."
          : directory?.status === "pending"
            ? "Verifying server access…"
            : "Opening your server…"}
      </p>
      {unavailable ? (
        <Link
          href="/dashboard/servers"
          className="text-sm underline underline-offset-4"
        >
          Open server directory
        </Link>
      ) : (
        <WorkspaceSkeleton
          name={displayGuild?.name}
          iconUrl={displayGuild?.iconUrl}
        />
      )}
    </div>
  )
}
