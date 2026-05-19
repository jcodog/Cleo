"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
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
import type { FunctionReturnType } from "convex/server"
import { useMutation, useQuery } from "convex/react"
import Image from "next/image"
import Link from "next/link"

import {
  DISCORD_GUILD_SECTION_TITLES,
  type DiscordGuildSection,
} from "./sections"

type GuildOverviewResult = FunctionReturnType<
  typeof api.queries.dashboard.discord.guilds.overview.get
>
type GuildOverview = Extract<
  GuildOverviewResult,
  { status: "ready" | "botLeft" }
>["overview"]
type GuildConfig = NonNullable<GuildOverview["guildConfig"]>
type SaveState = "idle" | "saving" | "success" | "error"

const MODULE_FIELDS = [
  {
    key: "aiEnabled",
    title: "AI Assistant",
    description: "Allow Cleo assistant responses where configured.",
    defaultValue: true,
  },
  {
    key: "moderationEnabled",
    title: "Moderation",
    description: "Enable moderation behaviour backed by this server config.",
    defaultValue: false,
  },
  {
    key: "welcomeEnabled",
    title: "Welcome",
    description: "Use the welcome configuration for new members.",
    defaultValue: false,
  },
  {
    key: "loggingEnabled",
    title: "Logging",
    description: "Write configured server events to the logging channel.",
    defaultValue: false,
  },
] as const

type ModuleKey = (typeof MODULE_FIELDS)[number]["key"]
type ModuleValues = Record<ModuleKey, boolean>

const CHANNEL_FIELDS = [
  {
    key: "logChannelId",
    title: "Log Channel ID",
    description: "General event logging destination.",
  },
  {
    key: "modLogChannelId",
    title: "Mod Log Channel ID",
    description: "Moderation action logging destination.",
  },
  {
    key: "welcomeChannelId",
    title: "Welcome Channel ID",
    description: "Welcome message destination.",
  },
  {
    key: "updatesChannelId",
    title: "Updates Channel ID",
    description: "Product or server update destination.",
  },
  {
    key: "announcementChannelId",
    title: "Announcement Channel ID",
    description: "Announcement destination.",
  },
] as const

type ChannelKey = (typeof CHANNEL_FIELDS)[number]["key"]
type ChannelValues = Record<ChannelKey, string>

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
    return <WorkspaceSkeleton />
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

  return (
    <WorkspaceReadyView
      isBotLeft={overviewResult.status === "botLeft"}
      overview={overviewResult.overview}
      section={section}
    />
  )
}

function WorkspaceSkeleton() {
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

function WorkspaceReadyView({
  isBotLeft,
  overview,
  section,
}: {
  isBotLeft: boolean
  overview: GuildOverview
  section: DiscordGuildSection
}) {
  const pageTitle = DISCORD_GUILD_SECTION_TITLES[section]

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <WorkspaceHeader
        isBotLeft={isBotLeft}
        overview={overview}
        title={pageTitle}
      />

      {isBotLeft ? (
        <Alert variant="destructive">
          <IconAlertTriangle aria-hidden />
          <AlertTitle>Bot Not Present</AlertTitle>
          <AlertDescription>
            Cleo is no longer in this Discord server. Reconnect controls are
            handled by a later install flow.
          </AlertDescription>
        </Alert>
      ) : null}

      {section === "overview" ? (
        <OverviewSection overview={overview} />
      ) : section === "modules" ? (
        <ModulesSection isBotLeft={isBotLeft} overview={overview} />
      ) : section === "channels" ? (
        <ChannelsSection isBotLeft={isBotLeft} overview={overview} />
      ) : (
        <ContextPlaceholder overview={overview} section={section} />
      )}
    </main>
  )
}

function WorkspaceHeader({
  isBotLeft,
  overview,
  title,
}: {
  isBotLeft: boolean
  overview: GuildOverview
  title: string
}) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <GuildIcon iconUrl={overview.iconUrl} name={overview.name} />
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-medium">
            {overview.name}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{title}</p>
        </div>
      </div>
      <Badge variant={isBotLeft ? "destructive" : "secondary"}>
        {isBotLeft ? "Bot Left" : "Ready"}
      </Badge>
    </header>
  )
}

function OverviewSection({ overview }: { overview: GuildOverview }) {
  const quickLinks = [
    ["Modules", `/dashboard/${overview.discordGuildId}/modules`],
    ["Channels", `/dashboard/${overview.discordGuildId}/channels`],
    ["Logs", `/dashboard/${overview.discordGuildId}/logs`],
    ["Settings", `/dashboard/${overview.discordGuildId}/settings`],
  ] as const

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>
            Synced Discord context for this workspace.
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

      <div className="flex flex-col gap-4">
        <ConfigSummary config={overview.guildConfig} />
        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {quickLinks.map(([label, href]) => (
              <Button
                key={href}
                className="justify-start"
                variant="outline"
                render={<Link href={href} />}
              >
                {label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ConfigSummary({ config }: { config: GuildConfig | null }) {
  const enabledCount = config
    ? [
        config.aiEnabled,
        config.moderationEnabled,
        config.welcomeEnabled,
        config.loggingEnabled,
      ].filter(Boolean).length
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Config</CardTitle>
        <CardDescription>
          {config ? "Synced guild configuration." : "No guild config yet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          <OverviewField
            label="Enabled Modules"
            value={`${enabledCount} / 4`}
          />
          <OverviewField
            label="Command Prefix"
            value={config?.commandPrefix ?? "Not Synced"}
          />
          <OverviewField
            label="Updated"
            value={formatDateTime(config?.updatedAt)}
          />
        </dl>
      </CardContent>
    </Card>
  )
}

function ModulesSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateModules = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateModules.update
  )
  const [values, setValues] = useState<ModuleValues>(() =>
    getModuleValues(overview.guildConfig)
  )
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isBotLeft) {
      return
    }

    setSaveState("saving")
    setErrorMessage(null)

    try {
      await updateModules({
        discordGuildId: overview.discordGuildId,
        modules: values,
      })
      setSaveState("success")
    } catch (error) {
      setSaveState("error")
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <form className="max-w-3xl" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>
            Toggle the modules stored in this guild configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FieldGroup>
            {MODULE_FIELDS.map((module) => (
              <Field key={module.key} orientation="horizontal">
                <Switch
                  aria-label={module.title}
                  checked={values[module.key]}
                  disabled={isBotLeft || saveState === "saving"}
                  onCheckedChange={(checked) => {
                    setValues((currentValues) => ({
                      ...currentValues,
                      [module.key]: checked,
                    }))
                    setSaveState("idle")
                    setErrorMessage(null)
                  }}
                />
                <FieldContent>
                  <FieldTitle>{module.title}</FieldTitle>
                  <FieldDescription>{module.description}</FieldDescription>
                </FieldContent>
              </Field>
            ))}
          </FieldGroup>

          <SaveStatus state={saveState} errorMessage={errorMessage} />

          <div>
            <Button
              disabled={isBotLeft || saveState === "saving"}
              type="submit"
            >
              {saveState === "saving" ? "Saving…" : "Save Modules"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}

function ChannelsSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateChannels = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateChannels.update
  )
  const [values, setValues] = useState<ChannelValues>(() =>
    getChannelValues(overview.guildConfig)
  )
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isBotLeft) {
      return
    }

    setSaveState("saving")
    setErrorMessage(null)

    try {
      await updateChannels({
        discordGuildId: overview.discordGuildId,
        channels: {
          logChannelId: toOptionalChannelValue(values.logChannelId),
          modLogChannelId: toOptionalChannelValue(values.modLogChannelId),
          welcomeChannelId: toOptionalChannelValue(values.welcomeChannelId),
          updatesChannelId: toOptionalChannelValue(values.updatesChannelId),
          announcementChannelId: toOptionalChannelValue(
            values.announcementChannelId
          ),
        },
      })
      setSaveState("success")
    } catch (error) {
      setSaveState("error")
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <form className="max-w-3xl" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            Store Discord channel IDs until channel sync is available.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <IconInfoCircle aria-hidden />
            <AlertTitle>Channel Picker Pending</AlertTitle>
            <AlertDescription>
              Channel lists will be selectable after Discord bot channel sync is
              wired. For now, save known Discord channel IDs.
            </AlertDescription>
          </Alert>

          <FieldGroup>
            {CHANNEL_FIELDS.map((channel) => (
              <Field key={channel.key}>
                <FieldLabel htmlFor={channel.key}>{channel.title}</FieldLabel>
                <Input
                  autoComplete="off"
                  disabled={isBotLeft || saveState === "saving"}
                  id={channel.key}
                  inputMode="numeric"
                  name={channel.key}
                  onChange={(event) => {
                    const value = event.target.value
                    setValues((currentValues) => ({
                      ...currentValues,
                      [channel.key]: value,
                    }))
                    setSaveState("idle")
                    setErrorMessage(null)
                  }}
                  placeholder="123456789012345678…"
                  spellCheck={false}
                  value={values[channel.key]}
                />
                <FieldDescription>{channel.description}</FieldDescription>
              </Field>
            ))}
          </FieldGroup>

          <SaveStatus state={saveState} errorMessage={errorMessage} />

          <div>
            <Button
              disabled={isBotLeft || saveState === "saving"}
              type="submit"
            >
              {saveState === "saving" ? "Saving…" : "Save Channels"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}

function ContextPlaceholder({
  overview,
  section,
}: {
  overview: GuildOverview
  section: DiscordGuildSection
}) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{DISCORD_GUILD_SECTION_TITLES[section]}</CardTitle>
        <CardDescription>
          This section is scoped to {overview.name}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <OverviewField label="Server" value={overview.name} />
          <OverviewField
            label="Config"
            value={overview.guildConfig ? "Synced" : "Not Created"}
          />
          <OverviewField
            label="Last Synced"
            value={formatDateTime(overview.lastSyncedAt)}
          />
          <OverviewField
            label="Access"
            value={overview.membership.isOwner ? "Owner" : "Manager"}
          />
        </dl>
      </CardContent>
    </Card>
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

function SaveStatus({
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

function getModuleValues(config: GuildConfig | null): ModuleValues {
  return {
    aiEnabled: config?.aiEnabled ?? true,
    moderationEnabled: config?.moderationEnabled ?? false,
    welcomeEnabled: config?.welcomeEnabled ?? false,
    loggingEnabled: config?.loggingEnabled ?? false,
  }
}

function getChannelValues(config: GuildConfig | null): ChannelValues {
  return {
    logChannelId: config?.logChannelId ?? "",
    modLogChannelId: config?.modLogChannelId ?? "",
    welcomeChannelId: config?.welcomeChannelId ?? "",
    updatesChannelId: config?.updatesChannelId ?? "",
    announcementChannelId: config?.announcementChannelId ?? "",
  }
}

function toOptionalChannelValue(value: string): string | null {
  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Try again or refresh this workspace."
}
