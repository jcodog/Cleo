"use client"

import { useMemo, useState } from "react"
import { IconAlertTriangle, IconBug, IconRefresh } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
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
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
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

type SeverityFilter = "all" | "info" | "warn" | "error" | "critical"

type ServiceAreaFilter =
  | "all"
  | "startup"
  | "gateway"
  | "command"
  | "configuration"
  | "permission"
  | "backend"
  | "transport"
  | "welcome"
  | "moderation"
  | "logging"
  | "unknown"

const severityOptions: SeverityFilter[] = [
  "all",
  "info",
  "warn",
  "error",
  "critical",
]

const serviceAreaOptions: ServiceAreaFilter[] = [
  "all",
  "startup",
  "gateway",
  "command",
  "configuration",
  "permission",
  "backend",
  "transport",
  "welcome",
  "moderation",
  "logging",
  "unknown",
]

export function DiscordRuntimeIncidentsPageShell() {
  const [severity, setSeverity] = useState<SeverityFilter>("all")
  const [serviceArea, setServiceArea] = useState<ServiceAreaFilter>("all")
  const [discordGuildId, setDiscordGuildId] = useState("")

  const queryArgs = useMemo(
    () => ({
      limit: 50,
      ...(severity !== "all" ? { severity } : {}),
      ...(serviceArea !== "all" ? { serviceArea } : {}),
      ...(discordGuildId.trim().length > 0
        ? { discordGuildId: discordGuildId.trim() }
        : {}),
    }),
    [discordGuildId, serviceArea, severity]
  )
  const result = useQuery(
    api.queries.dashboard.discord.runtimeIncidents.list.list,
    queryArgs
  )

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">
          Discord Runtime Incidents
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Recent Discord bot runtime incidents reported to Convex.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle>Incidents</CardTitle>
              <CardDescription>
                Read-only view of stored incident fingerprints and redacted
                metadata.
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setSeverity("all")
                setServiceArea("all")
                setDiscordGuildId("")
              }}
              type="button"
              variant="outline"
            >
              <IconRefresh aria-hidden data-icon="inline-start" />
              Reset Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <IncidentFilters
            discordGuildId={discordGuildId}
            onDiscordGuildIdChange={setDiscordGuildId}
            onServiceAreaChange={setServiceArea}
            onSeverityChange={setSeverity}
            serviceArea={serviceArea}
            severity={severity}
          />

          {result === undefined ? (
            <IncidentSkeleton />
          ) : result.status === "forbidden" ? (
            <RuntimeIncidentState
              description="This page requires a staff, admin, or superadmin account."
              title="Access Not Available"
            />
          ) : result.status === "disabled" ? (
            <RuntimeIncidentState
              description="The app-owned feature gate discordRuntimeIncidents is not enabled for this account."
              title="Feature Disabled"
            />
          ) : result.incidents.length > 0 ? (
            <IncidentTable incidents={result.incidents} />
          ) : (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconBug aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No Runtime Incidents</EmptyTitle>
                <EmptyDescription>
                  No stored Discord runtime incidents match the current filters.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function IncidentFilters({
  discordGuildId,
  onDiscordGuildIdChange,
  onServiceAreaChange,
  onSeverityChange,
  serviceArea,
  severity,
}: {
  discordGuildId: string
  onDiscordGuildIdChange: (value: string) => void
  onServiceAreaChange: (value: ServiceAreaFilter) => void
  onSeverityChange: (value: SeverityFilter) => void
  serviceArea: ServiceAreaFilter
  severity: SeverityFilter
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[180px_220px_minmax(220px,1fr)]">
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Severity
        </span>
        <NativeSelect
          className="w-full"
          onChange={(event) =>
            onSeverityChange(event.target.value as SeverityFilter)
          }
          value={severity}
        >
          {severityOptions.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option === "all" ? "All severities" : toTitleCase(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Service Area
        </span>
        <NativeSelect
          className="w-full"
          onChange={(event) =>
            onServiceAreaChange(event.target.value as ServiceAreaFilter)
          }
          value={serviceArea}
        >
          {serviceAreaOptions.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option === "all" ? "All service areas" : toTitleCase(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Discord Guild ID
        </span>
        <Input
          inputMode="numeric"
          onChange={(event) => onDiscordGuildIdChange(event.target.value)}
          placeholder="Optional guild snowflake"
          value={discordGuildId}
        />
      </label>
    </div>
  )
}

function IncidentTable({
  incidents,
}: {
  incidents: Array<{
    id: string
    severity: Exclude<SeverityFilter, "all">
    serviceArea: Exclude<ServiceAreaFilter, "all">
    message: string
    discordGuildId?: string
    commandName?: string
    eventName?: string
    operation?: string
    fingerprint: string
    metadata?: unknown
    firstSeenAt: number
    lastSeenAt: number
    occurrenceCount: number
  }>
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">Last Seen</TableHead>
            <TableHead className="w-[120px]">Severity</TableHead>
            <TableHead className="w-[140px]">Service Area</TableHead>
            <TableHead>Incident</TableHead>
            <TableHead className="w-[120px] text-right">Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incidents.map((incident) => (
            <TableRow key={incident.id}>
              <TableCell className="align-top text-xs text-muted-foreground">
                {formatDateTime(incident.lastSeenAt)}
              </TableCell>
              <TableCell className="align-top">
                <Badge variant={getSeverityBadgeVariant(incident.severity)}>
                  {toTitleCase(incident.severity)}
                </Badge>
              </TableCell>
              <TableCell className="align-top text-sm">
                {toTitleCase(incident.serviceArea)}
              </TableCell>
              <TableCell className="min-w-[360px] align-top whitespace-normal">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-sm font-medium break-words">
                    {incident.message}
                  </p>
                  <IncidentContext incident={incident} />
                  <p className="text-xs break-all text-muted-foreground">
                    {incident.fingerprint}
                  </p>
                  {incident.metadata !== undefined ? (
                    <pre className="max-h-28 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                      {formatMetadata(incident.metadata)}
                    </pre>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">
                {incident.occurrenceCount.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function IncidentContext({
  incident,
}: {
  incident: {
    commandName?: string
    discordGuildId?: string
    eventName?: string
    firstSeenAt: number
    operation?: string
  }
}) {
  const parts = [
    incident.discordGuildId ? `Guild ${incident.discordGuildId}` : null,
    incident.commandName ? `Command ${incident.commandName}` : null,
    incident.eventName ? `Event ${incident.eventName}` : null,
    incident.operation ? `Operation ${incident.operation}` : null,
    `First seen ${formatDateTime(incident.firstSeenAt)}`,
  ].filter((part): part is string => part !== null)

  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((part) => (
        <Badge key={part} variant="outline">
          {part}
        </Badge>
      ))}
    </div>
  )
}

function RuntimeIncidentState({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <Empty className="min-h-72 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconAlertTriangle aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function IncidentSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

function getSeverityBadgeVariant(
  severity: Exclude<SeverityFilter, "all">
): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "critical" || severity === "error") {
    return "destructive"
  }

  if (severity === "warn") {
    return "secondary"
  }

  return "outline"
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatMetadata(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return "Metadata could not be displayed."
  }
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}
