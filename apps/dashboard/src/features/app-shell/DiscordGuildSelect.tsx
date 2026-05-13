"use client"

import { IconChevronDown, IconPlus, IconServer } from "@tabler/icons-react"
import Image from "next/image"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { useAppShellStore } from "@/components/stores/app-shell-store"

type DiscordGuildOption = {
  id: string
  name: string
  iconUrl?: string
}

const DISCORD_GUILD_OPTIONS: DiscordGuildOption[] = []

function GuildIcon({
  className = "size-8",
  guild,
}: {
  className?: string
  guild?: DiscordGuildOption
}) {
  if (!guild?.iconUrl) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground ${className}`}
      >
        {guild?.name.slice(0, 1).toUpperCase() ?? (
          <IconServer aria-hidden className="size-4" />
        )}
      </span>
    )
  }

  return (
    <Image
      alt=""
      className={`shrink-0 rounded-md object-cover ${className}`}
      height={28}
      src={guild.iconUrl}
      unoptimized
      width={28}
    />
  )
}

export function DiscordGuildSelect() {
  const selectedPlatform = useAppShellStore((state) => state.selectedPlatform)
  const selectedDiscordGuildId = useAppShellStore(
    (state) => state.selectedDiscordGuildId
  )
  const setSelectedDiscordGuildId = useAppShellStore(
    (state) => state.setSelectedDiscordGuildId
  )

  const selectedGuildInOptions = DISCORD_GUILD_OPTIONS.some(
    (guild) => guild.id === selectedDiscordGuildId
  )
  const guildOptions =
    selectedDiscordGuildId && !selectedGuildInOptions
      ? [
          {
            id: selectedDiscordGuildId,
            name: "Selected Guild",
          },
          ...DISCORD_GUILD_OPTIONS,
        ]
      : DISCORD_GUILD_OPTIONS
  const selectedGuild = guildOptions.find(
    (guild) => guild.id === selectedDiscordGuildId
  )

  function handleAddGuild() {
    window.dispatchEvent(new CustomEvent("cleo:discord:add-guild"))
  }

  if (selectedPlatform !== "discord") {
    return null
  }

  return (
    <div className="flex flex-col gap-1.5 px-1 pt-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
      <p className="text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
        Server
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              aria-label="Select Discord guild"
              className="flex min-h-14 w-full min-w-0 items-center gap-3 overflow-hidden rounded-md px-3 py-2.5 text-left text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-2"
              type="button"
            >
              <GuildIcon
                className="size-8 group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:rounded-none group-data-[collapsible=icon]:bg-transparent"
                guild={selectedGuild}
              />
              <span className="min-w-0 flex-1 truncate font-medium group-data-[collapsible=icon]:hidden">
                {selectedGuild?.name ?? "Select A Guild"}
              </span>
              <IconChevronDown
                aria-hidden
                className="size-4 shrink-0 opacity-70 group-data-[collapsible=icon]:hidden"
              />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={handleAddGuild}>
              <IconPlus aria-hidden />
              Add Guild
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {guildOptions.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {guildOptions.map((guild) => (
                  <DropdownMenuItem
                    key={guild.id}
                    onClick={() => setSelectedDiscordGuildId(guild.id)}
                  >
                    <GuildIcon className="size-5" guild={guild} />
                    <span className="truncate">{guild.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
