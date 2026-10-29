"use client"

import { useAuth } from "@clerk/nextjs"
import { useMemo, useState, type ReactNode } from "react"
import { IconPlus, IconServer } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { Id } from "@workspace/backend/convex/_generated/dataModel.js"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"

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
  verified?: boolean
}

const EMPTY_MANAGEABLE_GUILDS: ManageableGuild[] = []

/** List deduplicated, openable guilds from authorized queries without inventing missing membership data. */
/** Present last-known servers with verification notices instead of redirecting on expiry. */
export function DiscordDashboardPageShell() {
  const { userId } = useAuth()
  const [search, setSearch] = useState("")
  const refresh = useQuery(api.communityRoles.refreshProgress)
  const { isLoading: isConvexAuthLoading } = useConvexAuth()
  const currentUser = useQuery(api.queries.dashboard.account.currentUser.get)
  const directory = useQuery(
    api.queries.dashboard.discord.guilds.directory.list
  )
  const manageableGuilds =
    directory?.clerkUserId === userId ? directory?.guilds : undefined
  const servers = useMemo(() => {
    const guildsByDiscordId = new Map<string, ManageableGuild>()

    for (const guild of manageableGuilds ?? EMPTY_MANAGEABLE_GUILDS) {
      guildsByDiscordId.set(guild.discordGuildId, guild)
    }

    return Array.from(guildsByDiscordId.values()).sort(
      (left, right) =>
        (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0) ||
        left.name.localeCompare(right.name)
    )
  }, [manageableGuilds])

  const filteredServers = servers.filter((guild) =>
    `${guild.name} ${guild.discordGuildId}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  )

  const isLoading =
    isConvexAuthLoading ||
    currentUser === undefined ||
    manageableGuilds === undefined

  return (
    <DashboardFrame>
      {directory && directory.status !== "ready" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {directory.status === "pending" || refresh?.state === "pending"
            ? "Verifying Discord permissions. Your server directory stays here while we check."
            : directory.status === "missingDiscord"
              ? "Connect Discord in your account to find your servers."
              : "Discord verification needs refreshing. Listed servers reflect your last verified access. Server tools remain restricted until verification succeeds."}
        </p>
      ) : null}
      {isLoading ? (
        <ServerListSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <section
            className="min-w-0 space-y-5"
            aria-labelledby="servers-heading"
          >
            <header className="flex flex-row items-center justify-between gap-3">
              <div className="min-w-0">
                <h2
                  className="font-heading text-base font-medium"
                  id="servers-heading"
                >
                  Your servers
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Recently opened servers appear first.
                </p>
              </div>
              <Badge variant="outline">{servers.length}</Badge>
            </header>
            <div className="space-y-5">
              <div className="max-w-md space-y-2">
                <label htmlFor="server-search" className="text-sm font-medium">
                  Find a server
                </label>
                <Input
                  id="server-search"
                  type="search"
                  placeholder="Search by name or Discord ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <p role="status" className="text-xs text-muted-foreground">
                {filteredServers.length} of {servers.length} servers
              </p>
              {filteredServers.length > 0 ? (
                <div className="min-w-0 border-y">
                  {filteredServers.map((guild, index) => (
                    <ServerRow
                      guild={guild}
                      isLast={index === filteredServers.length - 1}
                      key={guild.discordGuildId}
                    />
                  ))}
                </div>
              ) : (
                <Empty className="min-h-40 rounded-none px-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconServer aria-hidden />
                    </EmptyMedia>
                    <EmptyTitle>
                      {search ? "No matching servers" : "No servers yet"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {search
                        ? "Try another server name or Discord ID."
                        : "Cleo did not find a Discord server where the bot is present and this account has Manage Server access."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardFrame>
  )
}

/** Keep the dashboard title and installation entry available in every directory state. */
function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium">Servers</h1>
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

/** Reserve directory space until the initial query resolves, without an empty-state flash. */
function ServerListSkeleton() {
  return (
    <div className="min-w-0 space-y-5">
      <header className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-72" />
      </header>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  )
}

/** Link directly to the row's guild so stale saved selection cannot change the destination. */
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
        "group flex min-w-0 items-center justify-between gap-4 px-2 py-5 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
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
          {guild.verified === false ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Permissions need verification
            </p>
          ) : guild.lastOpenedAt !== undefined ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last opened {new Date(guild.lastOpenedAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">Open</span>
    </Link>
  )
}

/** Use decorative server artwork with a stable initial fallback when no icon exists. */
function GuildAvatar({
  guild,
}: {
  guild: Pick<ManageableGuild, "iconUrl" | "name">
}) {
  if (guild.iconUrl) {
    return (
      <Image
        alt=""
        className="size-11 shrink-0 rounded-md object-cover"
        height={44}
        src={guild.iconUrl}
        unoptimized
        width={44}
      />
    )
  }

  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium">
      {guild.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Omit unknown counts and fall back to the real Discord ID rather than invented totals. */
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
