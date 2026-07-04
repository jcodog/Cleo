import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLogs,
  IconServer,
} from "@tabler/icons-react"
import type { JSX } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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
import Image from "next/image"
import Link from "next/link"

import { formatDateTime, getBotStatusLabel, toTitleCase } from "../lib/format"
import type { GuildLog, GuildOverview, SaveState } from "../types"

export function WorkspaceSkeleton(): JSX.Element {
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
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </main>
  )
}

export function WorkspaceState({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: typeof IconServer
  title: string
}): JSX.Element {
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
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/dashboard"
        >
          Back to Dashboard
        </Link>
      </Empty>
    </main>
  )
}

export function GuildIcon({
  iconUrl,
  name,
}: {
  iconUrl?: string
  name: string
}): JSX.Element {
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

export function OverviewField({
  label,
  value,
}: {
  label: string
  value: string
}): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  )
}

export function BotStatusBadge({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}): JSX.Element {
  if (isBotLeft) {
    return <Badge variant="destructive">Bot Left</Badge>
  }

  if (overview.botJoinedAt !== undefined) {
    return <Badge variant="secondary">Gateway Synced</Badge>
  }

  if (overview.botInstallationVerifiedAt !== undefined) {
    return <Badge variant="secondary">REST Verified</Badge>
  }

  return <Badge variant="outline">Verification Needed</Badge>
}

export function SaveStatus({
  errorMessage,
  state,
}: {
  errorMessage: string | null
  state: SaveState
}): JSX.Element | null {
  if (state === "success") {
    return (
      <Alert>
        <IconCircleCheck aria-hidden />
        <AlertTitle>Saved</AlertTitle>
        <AlertDescription>Configuration changes were saved.</AlertDescription>
      </Alert>
    )
  }

  if (state === "error") {
    return (
      <Alert variant="destructive">
        <IconAlertTriangle aria-hidden />
        <AlertTitle>Save Failed</AlertTitle>
        <AlertDescription>
          {errorMessage ?? "Try again or refresh this workspace."}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

export function ReadinessRow({
  label,
  ready,
  value,
}: {
  label: string
  ready: boolean
  value: string
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
      <span className="truncate font-medium">{label}</span>
      <Badge variant={ready ? "secondary" : "outline"}>{value}</Badge>
    </div>
  )
}

export function SystemLogRow({
  isLast,
  log,
}: {
  isLast: boolean
  log: GuildLog
}): JSX.Element {
  return (
    <div className={isLast ? "p-3" : "border-b p-3"}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{log.message}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LogLevelBadge level={log.level} />
          <Badge variant="outline">{log.source}</Badge>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatDateTime(log.createdAt)}
      </p>
    </div>
  )
}

function LogLevelBadge({ level }: { level: GuildLog["level"] }) {
  if (level === "error") {
    return <Badge variant="destructive">Error</Badge>
  }

  if (level === "warn") {
    return <Badge variant="outline">Warn</Badge>
  }

  return <Badge variant="secondary">{toTitleCase(level)}</Badge>
}

export function BotStatusFields({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}): JSX.Element {
  return (
    <>
      <OverviewField
        label="Bot Status"
        value={getBotStatusLabel(isBotLeft, overview)}
      />
      <OverviewField
        label="Gateway Joined"
        value={formatDateTime(overview.botJoinedAt)}
      />
      <OverviewField
        label="Install Verified"
        value={formatDateTime(overview.botInstallationVerifiedAt)}
      />
      <OverviewField
        label="Bot Left"
        value={formatDateTime(overview.botLeftAt)}
      />
    </>
  )
}

export { IconAlertTriangle, IconInfoCircle, IconLogs, IconServer }
