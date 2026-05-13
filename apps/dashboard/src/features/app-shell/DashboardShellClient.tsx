"use client"

import { usePathname } from "next/navigation"
import {
  IconActivity,
  IconBolt,
  IconCommand,
  IconDeviceDesktop,
  IconHome,
  IconListDetails,
  IconLogs,
  IconMessageChatbot,
  IconRobot,
  IconSettings,
  IconShield,
  IconWebhook,
} from "@tabler/icons-react"

import {
  type AppShellPlatform,
  useAppShellStore,
} from "@/components/stores/app-shell-store"
import { AppShell } from "@/features/app-shell/AppShell"
import type { AppShellNavSection } from "@/features/app-shell/types"

export function DashboardShellClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const selectedPlatform = useAppShellStore((state) => state.selectedPlatform)
  const selectedDiscordGuildId = useAppShellStore(
    (state) => state.selectedDiscordGuildId
  )
  const hasSelectedDiscordGuild = Boolean(selectedDiscordGuildId)
  const discordOverviewHref = selectedDiscordGuildId
    ? `/dashboard/${selectedDiscordGuildId}`
    : "/dashboard"

  const platformNavSections: Record<AppShellPlatform, AppShellNavSection[]> = {
    discord: [
      {
        items: [
          {
            title: "Overview",
            href: discordOverviewHref,
            icon: IconHome,
            isActive:
              pathname === "/dashboard" || pathname === discordOverviewHref,
          },
          {
            title: "Modules",
            href: "/dashboard/discord/modules",
            icon: IconListDetails,
            isActive: pathname.startsWith("/dashboard/discord/modules"),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Moderation",
            href: "/dashboard/discord/moderation",
            icon: IconShield,
            isActive: pathname.startsWith("/dashboard/discord/moderation"),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Automation",
            href: "/dashboard/discord/automation",
            icon: IconBolt,
            isActive: pathname.startsWith("/dashboard/discord/automation"),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Commands",
            href: "/dashboard/discord/commands",
            icon: IconCommand,
            isActive: pathname.startsWith("/dashboard/discord/commands"),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Logs",
            href: "/dashboard/discord/logs",
            icon: IconLogs,
            isActive: pathname.startsWith("/dashboard/discord/logs"),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Settings",
            href: "/dashboard/discord/settings",
            icon: IconSettings,
            isActive: pathname.startsWith("/dashboard/discord/settings"),
            disabled: !hasSelectedDiscordGuild,
          },
        ],
      },
    ],
    kick: [
      {
        items: [
          {
            title: "Overview",
            href: "/dashboard",
            icon: IconHome,
            isActive: pathname === "/dashboard",
          },
          {
            title: "Chat Bot",
            href: "/dashboard/kick/chat-bot",
            icon: IconMessageChatbot,
            isActive: pathname.startsWith("/dashboard/kick/chat-bot"),
            disabled: true,
          },
          {
            title: "Commands",
            href: "/dashboard/kick/commands",
            icon: IconCommand,
            isActive: pathname.startsWith("/dashboard/kick/commands"),
            disabled: true,
          },
          {
            title: "Moderation",
            href: "/dashboard/kick/moderation",
            icon: IconShield,
            isActive: pathname.startsWith("/dashboard/kick/moderation"),
            disabled: true,
          },
          {
            title: "Overlays",
            href: "/dashboard/kick/overlays",
            icon: IconDeviceDesktop,
            isActive: pathname.startsWith("/dashboard/kick/overlays"),
            disabled: true,
          },
          {
            title: "Live Tools",
            href: "/dashboard/kick/live-tools",
            icon: IconActivity,
            isActive: pathname.startsWith("/dashboard/kick/live-tools"),
            disabled: true,
          },
          {
            title: "Settings",
            href: "/dashboard/kick/settings",
            icon: IconSettings,
            isActive: pathname.startsWith("/dashboard/kick/settings"),
            disabled: true,
          },
        ],
      },
    ],
    twitch: [
      {
        items: [
          {
            title: "Overview",
            href: "/dashboard",
            icon: IconHome,
            isActive: pathname === "/dashboard",
          },
          {
            title: "Chat Bot",
            href: "/dashboard/twitch/chat-bot",
            icon: IconRobot,
            isActive: pathname.startsWith("/dashboard/twitch/chat-bot"),
            disabled: true,
          },
          {
            title: "EventSub",
            href: "/dashboard/twitch/eventsub",
            icon: IconWebhook,
            isActive: pathname.startsWith("/dashboard/twitch/eventsub"),
            disabled: true,
          },
          {
            title: "Overlays",
            href: "/dashboard/twitch/overlays",
            icon: IconDeviceDesktop,
            isActive: pathname.startsWith("/dashboard/twitch/overlays"),
            disabled: true,
          },
          {
            title: "Live Tools",
            href: "/dashboard/twitch/live-tools",
            icon: IconActivity,
            isActive: pathname.startsWith("/dashboard/twitch/live-tools"),
            disabled: true,
          },
          {
            title: "Settings",
            href: "/dashboard/twitch/settings",
            icon: IconSettings,
            isActive: pathname.startsWith("/dashboard/twitch/settings"),
            disabled: true,
          },
        ],
      },
    ],
  }

  return (
    <AppShell
      footerNavSections={[]}
      navSections={platformNavSections[selectedPlatform]}
    >
      {children}
    </AppShell>
  )
}
