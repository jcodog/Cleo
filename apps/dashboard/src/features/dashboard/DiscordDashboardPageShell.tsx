"use client"

import { useMemo, type ReactNode } from "react"
import { IconPlus, IconServer } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { Id } from "@workspace/backend/convex/_generated/dataModel.js"
import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { useConvexAuth, useQuery } from "convex/react"
import Image from "next/image"
import Link from "next/link"

type ManageableGuild = {
  guildId?: Id<"guilds">
  discordGuildId: string
  name: string
  iconUrl?: string
  memberCount?: number
  presenceCount?: number
  botJoinedAt?: number
  botInstallationVerifiedAt?: number
  lastOpenedAt?: number
  lastSyncedAt?: number
}

const EMPTY_MANAGEABLE_GUILDS: ManageableGuild[] = []

export function DiscordDashboardPageShell() {
  const { isLoading: isConvexAuthLoading } = useConvexAuth()
  const currentUser = useQuery(api.queries.dashboard.account.currentUser.get)
  const manageableGuilds = useQuery(
    api.queries.dashboard.discord.guilds.manageable.list
  )
  const servers = useMemo(() => {
    const guildsByDiscordId = new Map<string, ManageableGuild>()

    for (const guild of manageableGuilds ?? EMPTY_MANAGEABLE_GUILDS) {
      if (isServerOpenable(guild)) {
        guildsByDiscordId.set(guild.discordGuildId, guild)
      }
    }

    return Array.from(guildsByDiscordId.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  }, [manageableGuilds])

  const isLoading =
    isConvexAuthLoading ||
    currentUser === undefined ||
    manageableGuilds === undefined

  return (
    <DashboardFrame>
      {isLoading ? (
        <ServerListSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>Servers</CardTitle>
                <CardDescription>
                  Discord servers this account can manage in Cleo.
                </CardDescription>
              </div>
              <Badge variant="outline">{servers.length}</Badge>
            </CardHeader>
            <CardContent>
              {servers.length > 0 ? (
                <div className="overflow-hidden rounded-lg border">
                  {servers.map((guild, index) => (
                    <ServerRow
                      guild={guild}
                      isLast={index === servers.length - 1}
                      key={guild.discordGuildId}
                    />
                  ))}
                </div>
              ) : (
                <Empty className="min-h-72 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconServer aria-hidden />
                    </EmptyMedia>
                    <EmptyTitle>No servers</EmptyTitle>
                    <EmptyDescription>
                      Cleo did not find a Discord server where the bot is
                      present and this account has Manage Server access.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardFrame>
  )
}

function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium">
            Discord Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage Discord servers where Cleo is present and your account has
            server management access.
          </p>
        </div>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/dashboard/add-server"
        >
          <IconPlus aria-hidden data-icon="inline-start" />
          Add Server
        </Link>
      </header>
      {children}
    </main>
  )
}

function ServerListSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </CardContent>
    </Card>
  )
}

function ServerRow({
  guild,
  isLast,
}: {
  guild: ManageableGuild
  isLast: boolean
}) {
  return (
    <Link
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 p-3 hover:bg-muted/50",
        !isLast && "border-b"
      )}
      href={`/dashboard/${guild.discordGuildId}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <GuildAvatar guild={guild} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{guild.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatServerMeta(guild)}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">Open</span>
    </Link>
  )
}

function GuildAvatar({
  guild,
}: {
  guild: Pick<ManageableGuild, "iconUrl" | "name">
}) {
  if (guild.iconUrl) {
    return (
      <Image
        alt=""
        className="size-9 shrink-0 rounded-md object-cover"
        height={36}
        src={guild.iconUrl}
        unoptimized
        width={36}
      />
    )
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium">
      {guild.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function isServerOpenable(guild: ManageableGuild) {
  return (
    guild.botJoinedAt !== undefined ||
    guild.botInstallationVerifiedAt !== undefined
  )
}

function formatServerMeta(guild: ManageableGuild) {
  const parts = [
    guild.memberCount !== undefined
      ? `${guild.memberCount.toLocaleString()} members`
      : null,
    guild.presenceCount !== undefined
      ? `${guild.presenceCount.toLocaleString()} online`
      : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(" · ") : guild.discordGuildId
}
