import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLogs,
  IconRobotOff,
  IconServer,
} from "@tabler/icons-react"
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import Image from "next/image"
import Link from "next/link"

import {
  CHANNEL_FIELDS,
  MODULE_FIELDS,
  getConfiguredChannelItems,
  type ChannelKey,
  type ModuleKey,
  type ModuleValues,
} from "../lib/config"
import { formatDateTime, getBotStatusLabel, toTitleCase } from "../lib/format"
import type { GuildConfig, GuildLog, GuildOverview, SaveState } from "../types"

export function WorkspaceSkeleton() {
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

export function RuntimeNotice() {
  return (
    <Alert>
      <IconRobotOff aria-hidden />
      <AlertTitle>Bot Runtime Sync Pending</AlertTitle>
      <AlertDescription>
        Bot-owned live state is unavailable until the Discord runtime migration
        is complete. This dashboard only shows stored Convex configuration and
        verified Discord access.
      </AlertDescription>
    </Alert>
  )
}

export function ChannelPickerNotice() {
  return (
    <Alert>
      <IconInfoCircle aria-hidden />
      <AlertTitle>Channel REST Discovery</AlertTitle>
      <AlertDescription>
        The add-server flow can load channels with Cleo&apos;s server-side bot
        token after installed state is synced. Until then, save known Discord
        channel IDs here.
      </AlertDescription>
    </Alert>
  )
}

export function GuildIcon({
  iconUrl,
  name,
}: {
  iconUrl?: string
  name: string
}) {
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
}) {
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
}) {
  if (isBotLeft) {
    return <Badge variant="destructive">Bot Left</Badge>
  }

  if (overview.botJoinedAt === undefined) {
    return <Badge variant="outline">Runtime Pending</Badge>
  }

  return <Badge variant="secondary">Ready</Badge>
}

export function ConfigSummary({ config }: { config: GuildConfig | null }) {
  const enabledCount = config
    ? [
        config.aiEnabled,
        config.moderationEnabled,
        config.welcomeEnabled,
        config.loggingEnabled,
      ].filter(Boolean).length
    : 0
  const configuredChannels = getConfiguredChannelItems(config).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Config Summary</CardTitle>
        <CardDescription>
          {config
            ? "Guild configuration exists."
            : "No guild config exists yet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          <OverviewField
            label="Enabled Modules"
            value={
              config ? `${enabledCount} / ${MODULE_FIELDS.length}` : "None"
            }
          />
          <OverviewField
            label="Configured Channels"
            value={
              config
                ? `${configuredChannels} / ${CHANNEL_FIELDS.length}`
                : "None"
            }
          />
          <OverviewField
            label="Command Prefix"
            value={config?.commandPrefix ?? "Not Synced"}
          />
          <OverviewField
            label="Log Level"
            value={toTitleCase(config?.logLevel ?? "not synced")}
          />
        </dl>
      </CardContent>
    </Card>
  )
}

export function FeatureListCard({
  description,
  items,
  title,
}: {
  description: string
  items: { label: string; value?: string }[]
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div
                className="flex min-w-0 items-center justify-between gap-3 text-sm"
                key={item.label}
              >
                <span className="truncate font-medium">{item.label}</span>
                {item.value ? (
                  <span className="truncate text-muted-foreground">
                    {item.value}
                  </span>
                ) : (
                  <Badge variant="secondary">Enabled</Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">None configured.</p>
        )}
      </CardContent>
    </Card>
  )
}

export function ModuleFieldGroup({
  disabled,
  onChange,
  values,
}: {
  disabled: boolean
  onChange: (key: ModuleKey, checked: boolean) => void
  values: ModuleValues
}) {
  return (
    <FieldGroup>
      {MODULE_FIELDS.map((module) => (
        <Field key={module.key} orientation="horizontal">
          <Switch
            aria-label={module.title}
            checked={values[module.key]}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(module.key, checked)}
          />
          <FieldContent>
            <FieldTitle>{module.title}</FieldTitle>
            <FieldDescription>{module.description}</FieldDescription>
          </FieldContent>
        </Field>
      ))}
    </FieldGroup>
  )
}

export function ChannelFieldGroup<TChannelKey extends ChannelKey>({
  disabled,
  fields,
  onChange,
  values,
}: {
  disabled: boolean
  fields: readonly {
    key: TChannelKey
    title: string
    description: string
  }[]
  onChange: (key: TChannelKey, value: string) => void
  values: Record<TChannelKey, string>
}) {
  return (
    <FieldGroup>
      {fields.map((channel) => (
        <Field key={channel.key}>
          <FieldLabel htmlFor={channel.key}>{channel.title}</FieldLabel>
          <Input
            autoComplete="off"
            disabled={disabled}
            id={channel.key}
            inputMode="numeric"
            name={channel.key}
            onChange={(event) => onChange(channel.key, event.target.value)}
            placeholder="123456789012345678…"
            spellCheck={false}
            value={values[channel.key]}
          />
          <FieldDescription>{channel.description}</FieldDescription>
        </Field>
      ))}
    </FieldGroup>
  )
}

export function SaveStatus({
  errorMessage,
  state,
}: {
  errorMessage: string | null
  state: SaveState
}) {
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
}) {
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
}) {
  return (
    <div className={isLast ? "p-3" : "border-b p-3"}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{log.message}</p>
          {log.stack ? (
            <p className="mt-1 line-clamp-2 text-xs break-words text-muted-foreground">
              {log.stack}
            </p>
          ) : null}
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
}) {
  return (
    <>
      <OverviewField
        label="Bot Status"
        value={getBotStatusLabel(isBotLeft, overview)}
      />
      <OverviewField
        label="Bot Joined"
        value={formatDateTime(overview.botJoinedAt)}
      />
      <OverviewField
        label="Bot Left"
        value={formatDateTime(overview.botLeftAt)}
      />
    </>
  )
}

export { IconAlertTriangle, IconInfoCircle, IconLogs, IconServer }
