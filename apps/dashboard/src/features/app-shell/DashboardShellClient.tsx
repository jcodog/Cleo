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
  const discordGuildSectionHref = (section: string) =>
    selectedDiscordGuildId
      ? `/dashboard/${selectedDiscordGuildId}/${section}`
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
            href: discordGuildSectionHref("modules"),
            icon: IconListDetails,
            isActive:
              selectedDiscordGuildId !== undefined &&
              pathname.startsWith(
                `/dashboard/${selectedDiscordGuildId}/modules`
              ),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Moderation",
            href: discordGuildSectionHref("moderation"),
            icon: IconShield,
            isActive:
              selectedDiscordGuildId !== undefined &&
              pathname.startsWith(
                `/dashboard/${selectedDiscordGuildId}/moderation`
              ),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Automation",
            href: discordGuildSectionHref("automation"),
            icon: IconBolt,
            isActive:
              selectedDiscordGuildId !== undefined &&
              pathname.startsWith(
                `/dashboard/${selectedDiscordGuildId}/automation`
              ),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Commands",
            href: discordGuildSectionHref("commands"),
            icon: IconCommand,
            isActive:
              selectedDiscordGuildId !== undefined &&
              pathname.startsWith(
                `/dashboard/${selectedDiscordGuildId}/commands`
              ),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Logs",
            href: discordGuildSectionHref("logs"),
            icon: IconLogs,
            isActive:
              selectedDiscordGuildId !== undefined &&
              pathname.startsWith(`/dashboard/${selectedDiscordGuildId}/logs`),
            disabled: !hasSelectedDiscordGuild,
          },
          {
            title: "Settings",
            href: discordGuildSectionHref("settings"),
            icon: IconSettings,
            isActive:
              selectedDiscordGuildId !== undefined &&
              pathname.startsWith(
                `/dashboard/${selectedDiscordGuildId}/settings`
              ),
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
            href: "/kick",
            icon: IconHome,
            isActive: pathname === "/kick",
          },
          {
            title: "Chat Bot",
            href: "/kick/chat-bot",
            icon: IconMessageChatbot,
            isActive: pathname.startsWith("/kick/chat-bot"),
            disabled: true,
          },
          {
            title: "Commands",
            href: "/kick/commands",
            icon: IconCommand,
            isActive: pathname.startsWith("/kick/commands"),
            disabled: true,
          },
          {
            title: "Moderation",
            href: "/kick/moderation",
            icon: IconShield,
            isActive: pathname.startsWith("/kick/moderation"),
            disabled: true,
          },
          {
            title: "Overlays",
            href: "/kick/overlays",
            icon: IconDeviceDesktop,
            isActive: pathname.startsWith("/kick/overlays"),
            disabled: true,
          },
          {
            title: "Live Tools",
            href: "/kick/live-tools",
            icon: IconActivity,
            isActive: pathname.startsWith("/kick/live-tools"),
            disabled: true,
          },
          {
            title: "Settings",
            href: "/kick/settings",
            icon: IconSettings,
            isActive: pathname.startsWith("/kick/settings"),
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
            href: "/twitch",
            icon: IconHome,
            isActive: pathname === "/twitch",
          },
          {
            title: "Chat Bot",
            href: "/twitch/chat-bot",
            icon: IconRobot,
            isActive: pathname.startsWith("/twitch/chat-bot"),
            disabled: true,
          },
          {
            title: "EventSub",
            href: "/twitch/eventsub",
            icon: IconWebhook,
            isActive: pathname.startsWith("/twitch/eventsub"),
            disabled: true,
          },
          {
            title: "Overlays",
            href: "/twitch/overlays",
            icon: IconDeviceDesktop,
            isActive: pathname.startsWith("/twitch/overlays"),
            disabled: true,
          },
          {
            title: "Live Tools",
            href: "/twitch/live-tools",
            icon: IconActivity,
            isActive: pathname.startsWith("/twitch/live-tools"),
            disabled: true,
          },
          {
            title: "Settings",
            href: "/twitch/settings",
            icon: IconSettings,
            isActive: pathname.startsWith("/twitch/settings"),
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
