"use client"

import { useEffect, useRef } from "react"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
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
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useMutation, useQuery } from "convex/react"
import Image from "next/image"
import Link from "next/link"

export const DISCORD_GUILD_SECTIONS = [
  "overview",
  "modules",
  "channels",
  "moderation",
  "automation",
  "commands",
  "logs",
  "settings",
] as const

export type DiscordGuildSection = (typeof DISCORD_GUILD_SECTIONS)[number]

const SECTION_TITLES: Record<DiscordGuildSection, string> = {
  overview: "Overview",
  modules: "Modules",
  channels: "Channels",
  moderation: "Moderation",
  automation: "Automation",
  commands: "Commands",
  logs: "Logs",
  settings: "Settings",
}

type DiscordGuildWorkspacePageShellProps = {
  discordGuildId: string
  section?: DiscordGuildSection
}

export function DiscordGuildWorkspacePageShell({
  discordGuildId,
  section = "overview",
}: DiscordGuildWorkspacePageShellProps) {
  const overviewResult = useQuery(
    api.queries.dashboard.discord.guilds.overview.get,
    { discordGuildId }
  )
  const markOpened = useMutation(
    api.mutations.dashboard.discord.guilds.markOpened.markOpened
  )
  const markedGuildIdsRef = useRef(new Set<Id<"guilds">>())

  useEffect(() => {
    if (overviewResult?.status !== "ready") {
      return
    }

    const guildId = overviewResult.overview.guildId

    if (markedGuildIdsRef.current.has(guildId)) {
      return
    }

    markedGuildIdsRef.current.add(guildId)

    void markOpened({ guildId }).catch(() => {
      markedGuildIdsRef.current.delete(guildId)
    })
  }, [markOpened, overviewResult])

  if (overviewResult === undefined) {
    return (
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <div className="flex items-center gap-3 border-b pb-5">
          <Skeleton className="size-10 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </main>
    )
  }

  if (overviewResult.status === "notFound") {
    return (
      <WorkspaceState
        description="This Discord server has not been synced to Cleo."
        icon={IconInfoCircle}
        title="Server Not Found"
      />
    )
  }

  if (overviewResult.status === "forbidden") {
    return (
      <WorkspaceState
        description="Your signed-in Discord identity does not have verified management access for this server."
        icon={IconAlertTriangle}
        title="Access Not Available"
      />
    )
  }

  const { overview } = overviewResult
  const pageTitle = SECTION_TITLES[section]
  const isBotLeft = overviewResult.status === "botLeft"

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <GuildIcon iconUrl={overview.iconUrl} name={overview.name} />
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-medium">
              {overview.name}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {pageTitle}
            </p>
          </div>
        </div>
        <Badge variant={isBotLeft ? "destructive" : "secondary"}>
          {isBotLeft ? "Bot Left" : "Ready"}
        </Badge>
      </header>

      {isBotLeft ? (
        <Alert variant="destructive">
          <IconAlertTriangle aria-hidden />
          <AlertTitle>Bot Not Present</AlertTitle>
          <AlertDescription>
            Cleo is no longer in this Discord server. Configuration controls
            stay disabled until a later install flow reconnects the bot.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{pageTitle}</CardTitle>
            <CardDescription>
              Current synced context for this Discord server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <OverviewField
                label="Members"
                value={formatNumber(overview.memberCount)}
              />
              <OverviewField
                label="Presence"
                value={formatNumber(overview.presenceCount)}
              />
              <OverviewField
                label="Bot Joined"
                value={formatDateTime(overview.botJoinedAt)}
              />
              <OverviewField
                label="Last Synced"
                value={formatDateTime(overview.lastSyncedAt)}
              />
              <OverviewField
                label="Last Opened"
                value={formatDateTime(overview.lastOpenedAt)}
              />
              <OverviewField
                label="Discord Guild ID"
                value={overview.discordGuildId}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              Verified Discord management context.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm">
              <IconCircleCheck aria-hidden />
              <span className="min-w-0 truncate">
                {overview.membership.isOwner ? "Server Owner" : "Can Manage"}
              </span>
            </div>
            <Separator />
            <dl className="flex flex-col gap-3">
              <OverviewField
                label="Verified"
                value={formatDateTime(overview.membership.managementVerifiedAt)}
              />
              <OverviewField
                label="Source"
                value={formatVerificationSource(
                  overview.membership.managementVerificationSource
                )}
              />
              <OverviewField
                label="Config"
                value={overview.guildConfig ? "Synced" : "Not Created"}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function WorkspaceState({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: typeof IconServer
  title: string
}) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-6 md:px-6 md:py-8">
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Back to Dashboard
        </Button>
      </Empty>
    </main>
  )
}

function GuildIcon({ iconUrl, name }: { iconUrl?: string; name: string }) {
  if (iconUrl) {
    return (
      <Image
        alt=""
        className="size-10 shrink-0 rounded-md object-cover"
        height={40}
        src={iconUrl}
        unoptimized
        width={40}
      />
    )
  }

  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium text-muted-foreground">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function OverviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  )
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return "Not Synced"
  }

  return new Intl.NumberFormat(undefined).format(value)
}

function formatDateTime(value: number | undefined): string {
  if (value === undefined) {
    return "Not Synced"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

function formatVerificationSource(value: string | undefined): string {
  if (value === undefined) {
    return "Not Synced"
  }

  if (value === "discord-bot") {
    return "Discord Bot"
  }

  if (value === "discord-oauth") {
    return "Discord OAuth"
  }

  return "Manual"
}
