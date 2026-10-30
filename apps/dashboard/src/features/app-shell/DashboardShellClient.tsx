"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import {
  IconHome,
  IconLogs,
  IconLifebuoy,
  IconSettings,
  IconShield,
  IconShieldLock,
  IconSparkles,
  IconBroadcast,
  IconClock,
  IconUserCircle,
  IconPlug,
  IconCreditCard,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  type Preloaded,
  useConvexAuth,
  usePreloadedQuery,
  useQuery,
} from "convex/react"

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

/** Derive navigation from the current route and display directory without refresh redirects. */
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
  const { sessionId, userId } = useAuth()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const liveStaffAccess = usePreloadedQuery(preloadedStaffAccess)
  const liveManageableGuilds = usePreloadedQuery(preloadedManageableGuilds)
  const directory = useQuery(
    api.queries.dashboard.discord.guilds.directory.list,
    isAuthenticated ? {} : "skip"
  )

  const [initialClerkSessionId] = useState(sessionId)
  const [initialStaffAccess] = useState(liveStaffAccess)
  const [initialManageableGuilds] = useState(liveManageableGuilds)

  const preloadBelongsToCurrentSession = sessionId === initialClerkSessionId

  const hasAuthenticationResolved =
    !isLoading || !preloadBelongsToCurrentSession

  const staffAccess = getConvexAuthHydrationResult({
    hasAuthenticationResolved,
    isAuthenticated,
    isLoading,
    liveResult: liveStaffAccess,
    preloadedResult: initialStaffAccess,
  })

  const manageableGuilds = getConvexAuthHydrationResult({
    hasAuthenticationResolved,
    isAuthenticated,
    isLoading,
    liveResult: liveManageableGuilds,
    preloadedResult: initialManageableGuilds,
  })

  const currentArea = getAppShellAreaFromPathname(pathname)
  const staffEntry = getStaffTopbarEntry(currentArea, staffAccess)
  const storedDiscordGuildId = useAppShellStore((state) =>
    state.selectionClerkUserId === userId
      ? state.selectedDiscordGuildId
      : undefined
  )
  const setSelectedDiscordGuildId = useAppShellStore(
    (state) => state.setSelectedDiscordGuildId
  )
  const selectionClerkUserId = useAppShellStore(
    (state) => state.selectionClerkUserId
  )
  useEffect(() => {
    if (userId && selectionClerkUserId && selectionClerkUserId !== userId)
      setSelectedDiscordGuildId(undefined, userId)
  }, [selectionClerkUserId, setSelectedDiscordGuildId, userId])
  const routeDiscordGuildId = getRouteDiscordGuildId(pathname)
  const { activeDiscordGuildId } = getDashboardGuildSelection({
    manageableGuilds:
      isAuthenticated && directory && directory.clerkUserId === userId
        ? directory.status === "ready"
          ? directory.guilds.filter((guild) => guild.verified)
          : directory.guilds
        : manageableGuilds,
    routeDiscordGuildId,
    storedDiscordGuildId,
  })
  const hasSelectedDiscordGuild = Boolean(
    routeDiscordGuildId && activeDiscordGuildId
  )
  const discordOverviewHref = activeDiscordGuildId
    ? `/dashboard/${activeDiscordGuildId}`
    : "/dashboard/servers"
  const discordGuildSectionHref = (section: string) =>
    activeDiscordGuildId
      ? `/dashboard/${activeDiscordGuildId}/${section}`
      : "/dashboard/servers"

  useEffect(() => {
    if (
      userId &&
      isAuthenticated &&
      directory?.clerkUserId === userId &&
      directory?.status === "ready" &&
      (!routeDiscordGuildId || activeDiscordGuildId === routeDiscordGuildId) &&
      storedDiscordGuildId !== activeDiscordGuildId
    ) {
      setSelectedDiscordGuildId(activeDiscordGuildId, userId)
    }
  }, [
    activeDiscordGuildId,
    userId,
    directory?.clerkUserId,
    isAuthenticated,
    directory?.status,
    setSelectedDiscordGuildId,
    storedDiscordGuildId,
    routeDiscordGuildId,
  ])

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
          title: "Live notifications",
          href: discordGuildSectionHref("live-notifications"),
          icon: IconBroadcast,
          isActive:
            activeDiscordGuildId !== undefined &&
            pathname.startsWith(
              `/dashboard/${activeDiscordGuildId}/live-notifications`
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
          title: "Premium Guild",
          href: discordGuildSectionHref("premium"),
          icon: IconSparkles,
          isActive:
            activeDiscordGuildId !== undefined &&
            pathname.startsWith(`/dashboard/${activeDiscordGuildId}/premium`),
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
          title: "Overview",
          href: "/staff",
          icon: IconHome,
          isActive: pathname === "/staff",
        },
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
        {
          title: "Linked Roles testing",
          href: "/staff/linked-roles",
          icon: IconShield,
          isActive: pathname.startsWith("/staff/linked-roles"),
        },
      ],
    },
  ]

  const platformNavSections: Record<AppShellArea, AppShellNavSection[]> = {
    account: [
      {
        title: "Account",
        items: [
          {
            title: "Profile",
            href: "/account",
            icon: IconUserCircle,
            isActive:
              pathname === "/account" ||
              (pathname.startsWith("/account/") &&
                !["security", "connections", "billing", "roles"].includes(
                  pathname.split("/")[2] ?? ""
                )),
          },
          {
            title: "Connected accounts",
            href: "/account/connections",
            icon: IconPlug,
            isActive: pathname === "/account/connections",
          },
          {
            title: "Security",
            href: "/account/security",
            icon: IconShieldLock,
            isActive: pathname.startsWith("/account/security"),
          },
          {
            title: "Billing & subscriptions",
            href: "/account/billing",
            icon: IconCreditCard,
            isActive: pathname === "/account/billing",
          },
        ],
      },
    ],
    discord: discordNavSections,
    staff: staffNavSections,
    kick: [],
    twitch: [
      {
        title: "Twitch account",
        items: [
          {
            title: "Overview",
            href: "/twitch",
            icon: IconHome,
            isActive: pathname === "/twitch",
          },
          {
            title: "Chat alerts",
            href: "/twitch/alerts",
            icon: IconBroadcast,
            isActive: pathname === "/twitch/alerts",
          },
          {
            title: "Chatbot timers",
            href: "/twitch/timers",
            icon: IconClock,
            isActive: pathname === "/twitch/timers",
          },
          {
            title: "Moderation",
            href: "/twitch/moderation",
            icon: IconShield,
            isActive: pathname === "/twitch/moderation",
          },
        ],
      },
    ],
  }

  return (
    <AppShell
      footerNavSections={[
        {
          items: [
            {
              title:
                currentArea === "account" ? "Back to dashboard" : "My account",
              href: currentArea === "account" ? "/dashboard" : "/account",
              icon: IconSettings,
              isActive: false,
            },
          ],
        },
      ]}
      navSections={
        currentArea === "discord" && pathname === "/dashboard/servers"
          ? [
              {
                items: [
                  {
                    title: "Servers",
                    href: "/dashboard/servers",
                    icon: IconHome,
                    isActive: true,
                  },
                ],
              },
            ]
          : platformNavSections[currentArea]
      }
      showDiscordGuildSelect={currentArea === "discord"}
      showPlatformSelector={
        currentArea === "discord" || currentArea === "twitch"
      }
      staffEntry={staffEntry}
    >
      {children}
    </AppShell>
  )
}
