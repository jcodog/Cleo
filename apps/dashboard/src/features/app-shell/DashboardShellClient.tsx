"use client"

import { useEffect, useState } from "react"
import { usePathname, redirect } from "next/navigation"
import {
  IconHome,
  IconLogs,
  IconLifebuoy,
  IconSettings,
  IconShield,
  IconShieldLock,
  IconSparkles,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { type Preloaded, useConvexAuth, usePreloadedQuery } from "convex/react"

import { useAppShellStore } from "@/components/stores/app-shell-store"
import { AppShell } from "@/features/app-shell/AppShell"
import { getConvexAuthHydrationResult } from "@/features/app-shell/convexAuthHydration"
import { getDashboardGuildSelection } from "@/features/app-shell/dashboardGuildSelection"
import {
  getAppShellAreaFromPathname,
  getRouteDiscordGuildId,
  type AppShellArea,
} from "@/features/app-shell/routes"
import { getStaffTopbarEntry } from "@/features/app-shell/staffAccess"
import type { AppShellNavSection } from "@/features/app-shell/types"

export function DashboardShellClient({
  children,
  preloadedManageableGuilds,
  preloadedStaffAccess,
}: {
  children: React.ReactNode
  preloadedManageableGuilds: Preloaded<
    typeof api.queries.dashboard.discord.guilds.manageable.list
  >
  preloadedStaffAccess: Preloaded<typeof api.queries.dashboard.staff.access.get>
}) {
  const pathname = usePathname()
  const staffAccess = usePreloadedQuery(preloadedStaffAccess)
  const liveManageableGuilds = usePreloadedQuery(preloadedManageableGuilds)
  const { isAuthenticated } = useConvexAuth()
  const [initialManageableGuilds] = useState(liveManageableGuilds)
  const manageableGuilds = getConvexAuthHydrationResult({
    isAuthenticated,
    liveResult: liveManageableGuilds,
    preloadedResult: initialManageableGuilds,
  })
  const currentArea = getAppShellAreaFromPathname(pathname)
  const staffEntry = getStaffTopbarEntry(currentArea, staffAccess)
  const storedDiscordGuildId = useAppShellStore(
    (state) => state.selectedDiscordGuildId
  )
  const setSelectedDiscordGuildId = useAppShellStore(
    (state) => state.setSelectedDiscordGuildId
  )
  const routeDiscordGuildId = getRouteDiscordGuildId(pathname)
  const { activeDiscordGuildId, invalidRouteGuildId, safeDashboardPath } =
    getDashboardGuildSelection({
      manageableGuilds,
      routeDiscordGuildId,
      storedDiscordGuildId,
    })
  const hasSelectedDiscordGuild = Boolean(activeDiscordGuildId)
  const discordOverviewHref = activeDiscordGuildId
    ? `/dashboard/${activeDiscordGuildId}`
    : "/dashboard"
  const discordGuildSectionHref = (section: string) =>
    activeDiscordGuildId
      ? `/dashboard/${activeDiscordGuildId}/${section}`
      : "/dashboard"

  useEffect(() => {
    if (
      manageableGuilds !== undefined &&
      storedDiscordGuildId !== activeDiscordGuildId
    ) {
      setSelectedDiscordGuildId(activeDiscordGuildId)
    }
  }, [
    activeDiscordGuildId,
    manageableGuilds,
    setSelectedDiscordGuildId,
    storedDiscordGuildId,
  ])

  if (invalidRouteGuildId) {
    redirect(safeDashboardPath)
  }

  if (pathname === "/dashboard" && activeDiscordGuildId) {
    redirect(`/dashboard/${activeDiscordGuildId}`)
  }

  const discordNavSections: AppShellNavSection[] = [
    {
      items: [
        {
          title: "Overview",
          href: discordOverviewHref,
          icon: IconHome,
          isActive:
            pathname === "/dashboard" ||
            pathname === discordOverviewHref ||
            (activeDiscordGuildId !== undefined &&
              pathname === `/dashboard/${activeDiscordGuildId}/overview`),
        },
        {
          title: "Welcome",
          href: discordGuildSectionHref("welcome"),
          icon: IconSparkles,
          isActive:
            activeDiscordGuildId !== undefined &&
            pathname.startsWith(`/dashboard/${activeDiscordGuildId}/welcome`),
          disabled: !hasSelectedDiscordGuild,
        },
        {
          title: "Moderation",
          href: discordGuildSectionHref("moderation"),
          icon: IconShield,
          isActive:
            activeDiscordGuildId !== undefined &&
            pathname.startsWith(
              `/dashboard/${activeDiscordGuildId}/moderation`
            ),
          disabled: !hasSelectedDiscordGuild,
        },
        {
          title: "Support",
          href: discordGuildSectionHref("support"),
          icon: IconLifebuoy,
          isActive:
            activeDiscordGuildId !== undefined &&
            pathname.startsWith(`/dashboard/${activeDiscordGuildId}/support`),
          disabled: !hasSelectedDiscordGuild,
        },
        {
          title: "Logs",
          href: discordGuildSectionHref("logs"),
          icon: IconLogs,
          isActive:
            activeDiscordGuildId !== undefined &&
            pathname.startsWith(`/dashboard/${activeDiscordGuildId}/logs`),
          disabled: !hasSelectedDiscordGuild,
        },
        {
          title: "Settings",
          href: discordGuildSectionHref("settings"),
          icon: IconSettings,
          isActive:
            activeDiscordGuildId !== undefined &&
            pathname.startsWith(`/dashboard/${activeDiscordGuildId}/settings`),
          disabled: !hasSelectedDiscordGuild,
        },
      ],
    },
  ]

  const staffNavSections: AppShellNavSection[] = [
    {
      title: "Staff",
      items: [
        {
          title: "Runtime Incidents",
          href: "/staff/discord-runtime-incidents",
          icon: IconShieldLock,
          isActive: pathname.startsWith("/staff/discord-runtime-incidents"),
        },
        {
          title: "Support Tickets",
          href: "/staff/support-tickets",
          icon: IconLifebuoy,
          isActive: pathname.startsWith("/staff/support-tickets"),
        },
      ],
    },
  ]

  const platformNavSections: Record<AppShellArea, AppShellNavSection[]> = {
    discord: discordNavSections,
    staff: staffNavSections,
    kick: [],
    twitch: [],
  }

  return (
    <AppShell
      footerNavSections={[]}
      navSections={platformNavSections[currentArea]}
      showDiscordGuildSelect={currentArea === "discord"}
      showPlatformSelector={currentArea === "kick" || currentArea === "twitch"}
      staffEntry={staffEntry}
    >
      {children}
    </AppShell>
  )
}
