"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { IconBrandTwitch } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Discord } from "@workspace/ui/components/ui/svgs/discord"
import { useAppShellStore } from "@/components/stores/app-shell-store"
import { getDashboardGuildSelection } from "./dashboardGuildSelection"
import { RELEASE_PLATFORMS } from "./routes"

export function AppPlatformSelector() {
  const pathname = usePathname()
  const router = useRouter()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const guilds = useQuery(api.queries.dashboard.discord.guilds.manageable.list)
  const storedDiscordGuildId = useAppShellStore((s) => s.selectedDiscordGuildId)
  const { safeDashboardPath } = getDashboardGuildSelection({
    manageableGuilds: guilds,
    routeDiscordGuildId: undefined,
    storedDiscordGuildId,
  })
  const currentPlatform =
    pathname === "/twitch" || pathname.startsWith("/twitch/")
      ? "twitch"
      : "discord"
  const presentation = {
    discord: {
      label: "Discord",
      Icon: Discord,
      href: safeDashboardPath,
    },
    twitch: {
      label: "Twitch",
      Icon: IconBrandTwitch,
      href: "/twitch",
    },
  }
  const options = RELEASE_PLATFORMS.map((value) => ({
    value,
    ...presentation[value],
  }))
  if (!isMobile && state === "collapsed") {
    const other = options.find((option) => option.value !== currentPlatform)
    if (!other) return null
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            aria-label={`Open ${other.label} workspace`}
            tooltip={`Open ${other.label} workspace`}
            render={<Link href={other.href} />}
          >
            <other.Icon aria-hidden />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }
  return (
    <ToggleGroup
      aria-label="Select platform"
      className={`grid w-full ${options.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
      value={[currentPlatform]}
      onValueChange={(value) => {
        const option = options.find((option) => option.value === value[0])
        if (option) {
          router.push(option.href)
          if (isMobile) setOpenMobile(false)
        }
      }}
    >
      {options.map(({ value, label, Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
        >
          <Icon aria-hidden className="size-4" />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
