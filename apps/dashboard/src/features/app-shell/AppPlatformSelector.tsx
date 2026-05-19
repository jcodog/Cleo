"use client"

import type { ComponentType } from "react"
import { usePathname, useRouter } from "next/navigation"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Discord } from "@workspace/ui/components/ui/svgs/discord"
import { KickDark } from "@workspace/ui/components/ui/svgs/kickDark"
import { Twitch } from "@workspace/ui/components/ui/svgs/twitch"

import type { AppShellPlatform } from "@/components/stores/app-shell-store"

const PLATFORM_OPTIONS: {
  label: string
  value: AppShellPlatform
  icon: ComponentType<{
    "aria-hidden"?: boolean
    className?: string
  }>
  iconClassName: string
  enabled: boolean
  href: string
}[] = [
  {
    label: "Discord",
    value: "discord",
    icon: Discord,
    iconClassName: "size-5",
    enabled: true,
    href: "/dashboard",
  },
  {
    label: "Kick",
    value: "kick",
    icon: KickDark,
    iconClassName: "size-auto h-4 w-11 brightness-0 dark:brightness-100",
    enabled: true,
    href: "/kick",
  },
  {
    label: "Twitch",
    value: "twitch",
    icon: Twitch,
    iconClassName: "size-5",
    enabled: true,
    href: "/twitch",
  },
]

function getPlatformFromPathname(pathname: string): AppShellPlatform {
  if (pathname === "/kick" || pathname.startsWith("/kick/")) {
    return "kick"
  }

  if (pathname === "/twitch" || pathname.startsWith("/twitch/")) {
    return "twitch"
  }

  return "discord"
}

export function AppPlatformSelector() {
  const pathname = usePathname()
  const router = useRouter()
  const currentPlatform = getPlatformFromPathname(pathname)

  return (
    <div className="flex flex-col gap-1.5 px-1 group-data-[collapsible=icon]:hidden">
      <p className="text-xs font-medium text-sidebar-foreground/70">Platform</p>
      <ToggleGroup
        aria-label="Select platform"
        className="grid w-full grid-cols-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-0.5"
        size="default"
        value={[currentPlatform]}
        onValueChange={(value) => {
          const nextPlatform = value[0]
          const nextOption = PLATFORM_OPTIONS.find(
            (option) => option.value === nextPlatform
          )

          if (nextOption?.enabled) {
            router.push(nextOption.href)
          }
        }}
      >
        {PLATFORM_OPTIONS.map((option) => {
          const Icon = option.icon

          return (
            <ToggleGroupItem
              key={option.value}
              aria-label={option.label}
              title={option.label}
              className="min-w-0 px-0 aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-accent-foreground [&_svg]:opacity-45 [&_svg]:brightness-75 [&_svg]:grayscale hover:[&_svg]:opacity-100 hover:[&_svg]:brightness-100 hover:[&_svg]:grayscale-0 aria-pressed:[&_svg]:opacity-100 aria-pressed:[&_svg]:brightness-100 aria-pressed:[&_svg]:grayscale-0"
              value={option.value}
              disabled={!option.enabled}
            >
              <Icon aria-hidden className={option.iconClassName} />
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}
