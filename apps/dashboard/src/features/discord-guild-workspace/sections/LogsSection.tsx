"use client"

import { useState } from "react"
import { IconRefresh } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
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

import { formatDateTime, getErrorMessage, toTitleCase } from "../lib/format"
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconLogs,
  SystemLogRow,
  WorkspaceState,
} from "../components/workspace-ui"
import type { GuildAuditEvent, SaveState } from "../types"

export function LogsSection({ discordGuildId }: { discordGuildId: string }) {
  const logsResult = useQuery(
    api.queries.dashboard.discord.guilds.systemLogs.list,
    { discordGuildId }
  )
  const dashboardAuditResult = useQuery(
    api.queries.dashboard.discord.guilds.auditEvents.list,
    { discordGuildId, source: "dashboard" }
  )
  const serverAuditResult = useQuery(
    api.queries.dashboard.discord.guilds.auditEvents.list,
    { discordGuildId, source: "discord-audit-log" }
  )
  const syncAuditLogs = useAction(
    api.actions.dashboard.discord.guilds.syncAuditLogs.sync
  )
  const [syncState, setSyncState] = useState<SaveState>("idle")
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  if (
    logsResult === undefined ||
    dashboardAuditResult === undefined ||
    serverAuditResult === undefined
  ) {
    return (
      <div className="flex max-w-4xl flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (
    logsResult.status === "notFound" ||
    dashboardAuditResult.status === "notFound" ||
    serverAuditResult.status === "notFound"
  ) {
    return (
      <WorkspaceState
        description="This Discord server has not been synced to Cleo yet."
        icon={IconInfoCircle}
        title="Server Not Found"
      />
    )
  }

  if (
    logsResult.status === "forbidden" ||
    dashboardAuditResult.status === "forbidden" ||
    serverAuditResult.status === "forbidden"
  ) {
    return (
      <WorkspaceState
        description="Your signed-in Discord identity does not have verified management access for these logs."
        icon={IconAlertTriangle}
        title="Access Not Available"
      />
    )
  }

  async function handleSyncAuditLogs() {
    setSyncState("saving")
    setSyncMessage(null)

    try {
      const result = await syncAuditLogs({ discordGuildId, force: true })

      if (result.status === "ready") {
        setSyncState("success")
        setSyncMessage(
          `Imported ${result.inserted}; skipped ${result.skipped} already stored.`
        )
        return
      }

      setSyncState("error")
      setSyncMessage(toSyncMessage(result.status))
    } catch (error) {
      setSyncState("error")
      setSyncMessage(getErrorMessage(error))
    }
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Discord Server Audit Log</CardTitle>
              <CardDescription>
                Manual server-side Discord REST import of this server&apos;s audit
                log.
              </CardDescription>
            </div>
            <Button
              disabled={syncState === "saving"}
              onClick={handleSyncAuditLogs}
              type="button"
              variant="outline"
            >
              <IconRefresh aria-hidden data-icon="inline-start" />
              {syncState === "saving" ? "Syncing…" : "Sync Discord Audit Log"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SyncStatus state={syncState} message={syncMessage} />
          <AuditSyncSummary syncState={serverAuditResult.syncState} />

          <AuditEventList
            emptyDescription="Run a manual sync once Cleo has installed server state and the server-side bot token can read Discord audit logs."
            emptyTitle="No Discord Audit Entries"
            events={serverAuditResult.events}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dashboard Audit Log</CardTitle>
          <CardDescription>
            Configuration changes made from this dashboard workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditEventList
            emptyDescription="Module and channel configuration saves will appear here with the signed-in Discord identity where available."
            emptyTitle="No Dashboard Audit Events"
            events={dashboardAuditResult.events}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Logs</CardTitle>
          <CardDescription>
            Guild-scoped system errors and backend operational logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsResult.logs.length > 0 ? (
            <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
              {logsResult.logs.map((log, index) => (
                <SystemLogRow
                  isLast={index === logsResult.logs.length - 1}
                  key={log.logId}
                  log={log}
                />
              ))}
            </div>
          ) : (
            <Empty className="min-h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconLogs aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No Guild-Scoped System Logs</EmptyTitle>
                <EmptyDescription>
                  Cleo has not recorded any system logs with metadata for this
                  Discord server.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AuditSyncSummary({
  syncState,
}: {
  syncState: {
    newestDiscordAuditLogId?: string
    newestOccurredAt?: number
    lastSyncedAt?: number
    lastSyncStatus: string
    lastSyncError?: string
  } | null
}) {
  if (!syncState) {
    return (
      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <AuditSummaryItem label="Sync Status" value="Not Synced" />
        <AuditSummaryItem label="Last Sync" value="Not Synced" />
        <AuditSummaryItem label="Newest Entry" value="Not Synced" />
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
      <AuditSummaryItem
        label="Sync Status"
        value={toTitleCase(syncState.lastSyncStatus)}
      />
      <AuditSummaryItem
        label="Last Sync"
        value={formatDateTime(syncState.lastSyncedAt)}
      />
      <AuditSummaryItem
        label="Newest Entry"
        value={
          syncState.newestOccurredAt
            ? formatDateTime(syncState.newestOccurredAt)
            : "Not Synced"
        }
      />
      {syncState.lastSyncError ? (
        <p className="text-sm text-muted-foreground sm:col-span-3">
          {syncState.lastSyncError}
        </p>
      ) : null}
    </div>
  )
}

function AuditSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  )
}

function AuditEventList({
  emptyDescription,
  emptyTitle,
  events,
}: {
  emptyDescription: string
  emptyTitle: string
  events: GuildAuditEvent[]
}) {
  if (events.length === 0) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconLogs aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
      {events.map((event, index) => (
        <AuditEventRow
          event={event}
          isLast={index === events.length - 1}
          key={event.auditEventId}
        />
      ))}
    </div>
  )
}

function AuditEventRow({
  event,
  isLast,
}: {
  event: GuildAuditEvent
  isLast: boolean
}) {
  return (
    <div className={isLast ? "p-3" : "border-b p-3"}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{event.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {event.actorDisplayName ??
              event.actorDiscordUserId ??
              (event.source === "dashboard" ? "Dashboard user" : "Discord")}
            {event.targetDiscordId ? ` -> ${event.targetDiscordId}` : ""}
          </p>
          {event.details.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {event.details.map((detail) => (
                <Badge key={detail} variant="outline">
                  {detail}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">{toTitleCase(event.source)}</Badge>
          <Badge variant="outline">{toTitleCase(event.eventType)}</Badge>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatDateTime(event.occurredAt)}
      </p>
    </div>
  )
}

function SyncStatus({
  message,
  state,
}: {
  message: string | null
  state: SaveState
}) {
  if (state === "success") {
    return (
      <Alert>
        <IconInfoCircle aria-hidden />
        <AlertTitle>Audit Log Synced</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  if (state === "error") {
    return (
      <Alert variant="destructive">
        <IconAlertTriangle aria-hidden />
        <AlertTitle>Audit Sync Unavailable</AlertTitle>
        <AlertDescription>
          {message ?? "Try again after Discord REST access is available."}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

function toSyncMessage(status: string): string {
  if (status === "pendingBotSync") {
    return "Cleo needs REST-verified installed server state before Discord audit logs can be read."
  }

  if (status === "auditLogSyncUnavailable") {
    return "Discord REST audit logs could not be loaded with the current server-side configuration."
  }

  return "Audit logs could not be synced for this server."
}
