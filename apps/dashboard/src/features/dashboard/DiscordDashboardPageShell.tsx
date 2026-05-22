"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  IconAlertCircle,
  IconBrandDiscord,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconPlus,
  IconServer,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { Id } from "@workspace/backend/convex/_generated/dataModel.js"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
import { useAction, useQuery } from "convex/react"
import Image from "next/image"
import Link from "next/link"

type ManageableGuild = {
  guildId: Id<"guilds">
  discordGuildId: string
  name: string
  iconUrl?: string
  memberCount?: number
  presenceCount?: number
  lastOpenedAt?: number
  lastSyncedAt?: number
}

type InstallableGuild = {
  discordGuildId: string
  name: string
  iconUrl?: string
  memberCount?: number
  presenceCount?: number
  state: "installed" | "installable" | "pending" | "unavailable"
  unavailableReason?:
    | "missingManageGuildPermission"
    | "botLeft"
    | "botSyncUnavailable"
    | "verificationUnavailable"
  installSessionId?: Id<"discordGuildInstallSessions">
  installSessionStatus?: "pending" | "bot_joined" | "configured" | "expired"
  installSessionExpiresAt?: number
  dashboardHref?: string
}

type InstallableGuildsResult =
  | {
      status: "missingDiscordIdentity"
    }
  | {
      status: "discordGuildDiscoveryUnavailable"
      reason:
        | "clerkSecretUnavailable"
        | "discordAccessTokenUnavailable"
        | "discordTokenResolutionUnavailable"
        | "discordGuildScopeUnavailable"
        | "discordApiUnavailable"
      guilds: InstallableGuild[]
    }
  | {
      status: "ready"
      guilds: InstallableGuild[]
    }

const EMPTY_MANAGEABLE_GUILDS: ManageableGuild[] = []
const EMPTY_INSTALLABLE_GUILDS: InstallableGuild[] = []

export function DiscordDashboardPageShell() {
  const currentUser = useQuery(api.queries.dashboard.account.currentUser.get)
  const discordIdentity = useQuery(
    api.queries.dashboard.account.discordIdentity.get
  )
  const manageableGuilds = useQuery(
    api.queries.dashboard.discord.guilds.manageable.list
  )
  const listInstallableGuilds = useAction(
    api.actions.dashboard.discord.install.listInstallableGuilds.list
  )
  const [guildResult, setGuildResult] =
    useState<InstallableGuildsResult | null>(null)
  const [discoveryError, setDiscoveryError] = useState(false)
  const currentUserId = currentUser?._id
  const discordIdentityId = discordIdentity?._id

  useEffect(() => {
    if (!currentUserId || !discordIdentityId) {
      return
    }

    let cancelled = false

    listInstallableGuilds({})
      .then((result) => {
        if (!cancelled) {
          setGuildResult(result)
          setDiscoveryError(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiscoveryError(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentUserId, discordIdentityId, listInstallableGuilds])

  const isLoading =
    currentUser === undefined ||
    discordIdentity === undefined ||
    manageableGuilds === undefined
  const installedGuilds = manageableGuilds ?? EMPTY_MANAGEABLE_GUILDS
  const discoveryGuilds = useMemo(
    () =>
      guildResult?.status === "ready"
        ? guildResult.guilds
        : EMPTY_INSTALLABLE_GUILDS,
    [guildResult]
  )
  const allDiscoveryGuilds = useMemo(
    () =>
      guildResult?.status === "ready" ||
      guildResult?.status === "discordGuildDiscoveryUnavailable"
        ? guildResult.guilds
        : EMPTY_INSTALLABLE_GUILDS,
    [guildResult]
  )
  const unavailableGuilds = useMemo(
    () => allDiscoveryGuilds.filter((guild) => guild.state === "unavailable"),
    [allDiscoveryGuilds]
  )
  const pendingGuilds = useMemo(
    () =>
      (guildResult?.status === "ready" ||
      guildResult?.status === "discordGuildDiscoveryUnavailable"
        ? guildResult.guilds
        : []
      ).filter((guild) => guild.state === "pending"),
    [guildResult]
  )
  const installableGuilds = useMemo(
    () => discoveryGuilds.filter((guild) => guild.state === "installable"),
    [discoveryGuilds]
  )
  const recentlyOpenedGuilds = useMemo(
    () =>
      installedGuilds
        .filter((guild) => guild.lastOpenedAt !== undefined)
        .slice(0, 5),
    [installedGuilds]
  )

  if (isLoading) {
    return (
      <DashboardFrame>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </DashboardFrame>
    )
  }

  if (!currentUser || !discordIdentity) {
    return (
      <DashboardFrame>
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconBrandDiscord aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Discord identity syncing</EmptyTitle>
            <EmptyDescription>
              Your signed-in Discord identity has not reached the dashboard
              backend yet. Refresh shortly to see manageable servers.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </DashboardFrame>
    )
  }

  return (
    <DashboardFrame>
      <div className="flex flex-col gap-4">
        {discoveryError ? (
          <Alert variant="destructive">
            <IconAlertCircle aria-hidden />
            <AlertTitle>Discord discovery unavailable</AlertTitle>
            <AlertDescription>
              Cleo could not check live Discord server discovery. Previously
              verified servers are still shown below.
            </AlertDescription>
          </Alert>
        ) : null}

        {guildResult?.status === "discordGuildDiscoveryUnavailable" ? (
          <Alert>
            <IconAlertCircle aria-hidden />
            <AlertTitle>Live Discord discovery unavailable</AlertTitle>
            <AlertDescription>
              {getGuildDiscoveryUnavailableCopy(guildResult.reason)}
            </AlertDescription>
          </Alert>
        ) : null}

        {guildResult?.status === "missingDiscordIdentity" ? (
          <Alert>
            <IconBrandDiscord aria-hidden />
            <AlertTitle>Discord identity syncing</AlertTitle>
            <AlertDescription>
              Cleo is waiting for the signed-in Discord identity to reach the
              dashboard backend.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-4">
            <GuildListCard
              description="Servers where this Discord identity has verified dashboard access."
              emptyDescription="No installed Discord servers are verified for this account yet."
              emptyTitle="No installed servers"
              guilds={installedGuilds}
              title="Installed Servers"
            />

            <InstallableGuildList
              guilds={installableGuilds}
              title="Available From Discord"
            />
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Next Action</CardTitle>
                <CardDescription>
                  Add Cleo to a server your Discord identity can manage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full justify-start"
                  render={<Link href="/dashboard/add-server" />}
                >
                  <IconPlus aria-hidden data-icon="inline-start" />
                  Add Discord Server
                </Button>
              </CardContent>
            </Card>

            <InstallableGuildList
              guilds={pendingGuilds}
              title="Pending Installs"
            />

            <GuildListCard
              description="Recently opened verified servers."
              emptyDescription="Open a server workspace and it will appear here."
              emptyTitle="No recent servers"
              guilds={recentlyOpenedGuilds}
              title="Recently Opened"
            />

            {unavailableGuilds.length > 0 ? (
              <UnavailableGuilds guilds={unavailableGuilds} />
            ) : null}
          </div>
        </div>
      </div>
    </DashboardFrame>
  )
}

function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium">
            Discord Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage installed Discord servers and continue active install flows.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/dashboard/add-server" />}>
          <IconPlus aria-hidden data-icon="inline-start" />
          Add Server
        </Button>
      </header>
      {children}
    </main>
  )
}

function GuildListCard({
  description,
  emptyDescription,
  emptyTitle,
  guilds,
  title,
}: {
  description: string
  emptyDescription: string
  emptyTitle: string
  guilds: ManageableGuild[]
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline">{guilds.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {guilds.length > 0 ? (
          <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
            {guilds.map((guild, index) => (
              <ServerRow
                href={`/dashboard/${guild.discordGuildId}`}
                isLast={index === guilds.length - 1}
                key={guild.discordGuildId}
                guild={guild}
                status="Installed"
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-56 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconServer aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

function InstallableGuildList({
  guilds,
  title,
}: {
  guilds: InstallableGuild[]
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {title === "Pending Installs"
                ? "Install sessions waiting for Discord install state."
                : "Manageable servers returned by Discord REST discovery."}
            </CardDescription>
          </div>
          <Badge variant="outline">{guilds.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {guilds.length > 0 ? (
          <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
            {guilds.map((guild, index) => (
              <ServerRow
                href={
                  guild.state === "installed"
                    ? (guild.dashboardHref ??
                      `/dashboard/${guild.discordGuildId}`)
                    : "/dashboard/add-server"
                }
                isLast={index === guilds.length - 1}
                key={guild.discordGuildId}
                guild={guild}
                status={guild.state === "pending" ? "Pending" : "Installable"}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {title === "Pending Installs"
              ? "No active install sessions."
              : "No additional manageable servers were returned by Discord REST."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function UnavailableGuilds({ guilds }: { guilds: InstallableGuild[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unavailable Servers</CardTitle>
        <CardDescription>
          Servers returned by Discord that Cleo cannot open or install from the
          current verified state.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {guilds.slice(0, 5).map((guild) => (
          <div
            className="flex min-w-0 items-center justify-between gap-3 text-sm"
            key={guild.discordGuildId}
          >
            <span className="truncate font-medium">{guild.name}</span>
            <Badge variant="outline">
              {getUnavailableReason(guild.unavailableReason)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ServerRow({
  guild,
  href,
  isLast,
  status,
}: {
  guild: ManageableGuild | InstallableGuild
  href: string
  isLast: boolean
  status: string
}) {
  return (
    <Link
      className={
        isLast
          ? "flex min-w-0 items-center justify-between gap-3 p-3 hover:bg-muted/50"
          : "flex min-w-0 items-center justify-between gap-3 border-b p-3 hover:bg-muted/50"
      }
      href={href}
    >
      <div className="flex min-w-0 items-center gap-3">
        <GuildAvatar guild={guild} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{guild.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {guild.discordGuildId}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={status === "Installed" ? "secondary" : "outline"}>
          {status}
        </Badge>
        {status === "Pending" ? (
          <IconClock aria-hidden className="text-muted-foreground" />
        ) : status === "Installed" ? (
          <IconCircleCheck aria-hidden className="text-muted-foreground" />
        ) : (
          <IconExternalLink aria-hidden className="text-muted-foreground" />
        )}
      </div>
    </Link>
  )
}

function GuildAvatar({
  guild,
}: {
  guild: Pick<ManageableGuild | InstallableGuild, "iconUrl" | "name">
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

function getGuildDiscoveryUnavailableCopy(
  reason: Extract<
    InstallableGuildsResult,
    { status: "discordGuildDiscoveryUnavailable" }
  >["reason"]
) {
  switch (reason) {
    case "clerkSecretUnavailable":
      return "Server-side Clerk token resolution is not configured, so Cleo can only show servers already verified in Convex."
    case "discordAccessTokenUnavailable":
      return "Clerk did not return a Discord OAuth access token, so Cleo can only show servers already verified in Convex."
    case "discordGuildScopeUnavailable":
      return "The Discord OAuth token cannot read user guilds. Cleo can only show servers already verified in Convex."
    case "discordApiUnavailable":
      return "Discord REST guild discovery is temporarily unavailable. Cleo can still show servers already verified in Convex."
    case "discordTokenResolutionUnavailable":
      return "Cleo could not resolve the Discord OAuth token server-side, so only previously verified servers are shown."
  }
}

function getUnavailableReason(reason: InstallableGuild["unavailableReason"]) {
  switch (reason) {
    case "missingManageGuildPermission":
      return "No manage access"
    case "botLeft":
      return "Bot left"
    case "botSyncUnavailable":
      return "Sync pending"
    case "verificationUnavailable":
      return "Not verified"
    default:
      return "Unavailable"
  }
}
