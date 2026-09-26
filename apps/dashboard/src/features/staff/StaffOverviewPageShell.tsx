"use client"

import type { ReactNode } from "react"
import {
  IconActivity,
  IconAlertTriangle,
  IconServer,
  IconUser,
  IconUsers,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Badge } from "@workspace/ui/components/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useQuery } from "convex/react"

export function StaffOverviewPageShell() {
  const result = useQuery(api.queries.dashboard.staff.access.overview, {})

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">Staff Operations</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Read-only operational visibility across Cleo&apos;s Discord footprint.
          Member activity is deliberately limited to event type, server and
          timestamp.
        </p>
      </header>

      {result === undefined ? (
        <OverviewSkeleton />
      ) : result.status === "forbidden" ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconAlertTriangle aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Access Not Available</EmptyTitle>
            <EmptyDescription>
              This page requires a staff, admin, or superadmin account.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <MetricCards metrics={result.metrics} />
          <GuildsCard guilds={result.guilds} />
          <ActivityCard activity={result.activity} />
        </>
      )}
    </main>
  )
}

function MetricCards({
  metrics,
}: {
  metrics: {
    guildCount: number
    userCount: number
    registeredAccountCount: number
  }
}) {
  return (
    <section
      aria-label="Cleo operational totals"
      className="grid gap-4 md:grid-cols-3"
    >
      <MetricCard
        description="Servers Cleo is currently installed in."
        icon={<IconServer aria-hidden />}
        label="Guilds"
        value={metrics.guildCount}
      />
      <MetricCard
        description="Sum of current server member-count snapshots, not unique people."
        icon={<IconUsers aria-hidden />}
        label="Users"
        value={metrics.userCount}
      />
      <MetricCard
        description="Non-disabled Cleo dashboard accounts stored in Convex."
        icon={<IconUser aria-hidden />}
        label="Registered accounts"
        value={metrics.registeredAccountCount}
      />
    </section>
  )
}

function MetricCard({
  description,
  icon,
  label,
  value,
}: {
  description: string
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-2 text-3xl tabular-nums">
            {value.toLocaleString()}
          </CardTitle>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function GuildsCard({
  guilds,
}: {
  guilds: Array<{
    discordGuildId: string
    name: string
    memberCount?: number
    botJoinedAt: number
    lastSyncedAt?: number
  }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Discord Servers</CardTitle>
        <CardDescription>
          Every server currently reporting Cleo as installed, ordered by member
          count.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {guilds.length === 0 ? (
          <Empty className="min-h-56 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconServer aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No Active Servers</EmptyTitle>
              <EmptyDescription>
                No current Cleo Discord installations are recorded.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Discord Guild ID</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Cleo joined</TableHead>
                  <TableHead className="text-right">Last sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guilds.map((guild) => (
                  <TableRow key={guild.discordGuildId}>
                    <TableCell className="font-medium">{guild.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {guild.discordGuildId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {guild.memberCount?.toLocaleString() ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(guild.botJoinedAt)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {guild.lastSyncedAt !== undefined
                        ? formatDateTime(guild.lastSyncedAt)
                        : "Unknown"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityCard({
  activity,
}: {
  activity: Array<{
    id: string
    eventType: string
    summary: string
    discordGuildId: string
    guildName: string
    occurredAt: number
  }>
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            <IconActivity aria-hidden />
          </div>
          <div className="min-w-0">
            <CardTitle>Recent Cleo Activity</CardTitle>
            <CardDescription>
              The latest 100 lifecycle and Discord events. User identity,
              message content, reasons and raw event metadata are not exposed.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <Empty className="min-h-56 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconActivity aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No Activity Yet</EmptyTitle>
              <EmptyDescription>
                Cleo has not recorded any operational Discord events yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">Time</TableHead>
                  <TableHead className="w-[190px]">Event</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Guild ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(event.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getEventBadgeVariant(event.eventType)}>
                        {event.summary}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.guildName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {event.discordGuildId}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

function getEventBadgeVariant(
  eventType: string
): "default" | "secondary" | "destructive" | "outline" {
  if (
    eventType === "botGuildLeave" ||
    eventType === "guildMemberRemove" ||
    eventType === "guildBanAdd"
  ) {
    return "secondary"
  }

  if (eventType === "botGuildJoin" || eventType === "guildMemberAdd") {
    return "default"
  }

  return "outline"
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
