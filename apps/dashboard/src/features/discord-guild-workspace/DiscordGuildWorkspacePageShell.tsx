"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconCommand,
  IconHash,
  IconInfoCircle,
  IconListDetails,
  IconLogs,
  IconRobotOff,
  IconServer,
  IconSettings,
  IconShield,
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
type GuildLogsResult = FunctionReturnType<
  typeof api.queries.dashboard.discord.guilds.systemLogs.list
>
type GuildLog = Extract<GuildLogsResult, { status: "ready" }>["logs"][number]
type SaveState = "idle" | "saving" | "success" | "error"

const MODULE_FIELDS = [
  {
    key: "aiEnabled",
    title: "AI Assistant",
    description:
      "Allow Cleo assistant command responses when runtime support is available.",
    defaultValue: true,
  },
  {
    key: "moderationEnabled",
    title: "Moderation",
    description: "Store whether moderation should be active for the server.",
    defaultValue: false,
  },
  {
    key: "welcomeEnabled",
    title: "Welcome",
    description: "Store whether welcome automation should run for new members.",
    defaultValue: false,
  },
  {
    key: "loggingEnabled",
    title: "Logging",
    description:
      "Store whether configured system and bot events should be logged.",
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

const MODERATION_CHANNEL_FIELDS = [
  CHANNEL_FIELDS[1],
  CHANNEL_FIELDS[0],
] as const
const AUTOMATION_CHANNEL_FIELDS = [
  CHANNEL_FIELDS[2],
  CHANNEL_FIELDS[3],
  CHANNEL_FIELDS[4],
] as const

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
        description="This Discord server has not been synced to Cleo yet."
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
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
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
            Cleo is no longer in this Discord server. Reconnect controls belong
            to a later install flow.
          </AlertDescription>
        </Alert>
      ) : null}

      {overview.botJoinedAt === undefined && !isBotLeft ? (
        <RuntimeNotice />
      ) : null}

      {section === "overview" ? (
        <OverviewSection isBotLeft={isBotLeft} overview={overview} />
      ) : section === "modules" ? (
        <ModulesSection
          key={`${overview.discordGuildId}:modules`}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      ) : section === "channels" ? (
        <ChannelsSection
          key={`${overview.discordGuildId}:channels`}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      ) : section === "moderation" ? (
        <ModerationSection
          key={`${overview.discordGuildId}:moderation`}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      ) : section === "automation" ? (
        <AutomationSection
          key={`${overview.discordGuildId}:automation`}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      ) : section === "commands" ? (
        <CommandsSection
          key={`${overview.discordGuildId}:commands`}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      ) : section === "logs" ? (
        <LogsSection discordGuildId={overview.discordGuildId} />
      ) : (
        <SettingsSection isBotLeft={isBotLeft} overview={overview} />
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
      <BotStatusBadge isBotLeft={isBotLeft} overview={overview} />
    </header>
  )
}

function RuntimeNotice() {
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

function OverviewSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const config = overview.guildConfig
  const quickLinks = [
    [
      "Moderation",
      `/dashboard/${overview.discordGuildId}/moderation`,
      IconShield,
    ],
    [
      "Automation",
      `/dashboard/${overview.discordGuildId}/automation`,
      IconBolt,
    ],
    ["Commands", `/dashboard/${overview.discordGuildId}/commands`, IconCommand],
    ["Logs", `/dashboard/${overview.discordGuildId}/logs`, IconLogs],
    [
      "Settings",
      `/dashboard/${overview.discordGuildId}/settings`,
      IconSettings,
    ],
  ] as const

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Server Identity</CardTitle>
            <CardDescription>
              Verified Discord server context stored in Convex.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <OverviewField label="Server" value={overview.name} />
              <OverviewField
                label="Discord Guild ID"
                value={overview.discordGuildId}
              />
              <OverviewField
                label="Members"
                value={formatNumber(overview.memberCount)}
              />
              <OverviewField
                label="Presence"
                value={formatNumber(overview.presenceCount)}
              />
              <OverviewField
                label="Access"
                value={overview.membership.isOwner ? "Owner" : "Manager"}
              />
              <OverviewField
                label="Verified"
                value={formatDateTime(overview.membership.managementVerifiedAt)}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bot Status & Sync</CardTitle>
            <CardDescription>
              Stored timestamps only. Live Discord runtime state is not
              inferred.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
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
              <OverviewField
                label="Last Synced"
                value={formatDateTime(overview.lastSyncedAt)}
              />
              <OverviewField
                label="Last Opened"
                value={formatDateTime(overview.lastOpenedAt)}
              />
              <OverviewField
                label="Config Updated"
                value={formatDateTime(config?.updatedAt)}
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <ConfigSummary config={config} />
        <FeatureListCard
          description="Configured module flags for this server."
          items={getModuleItems(config)}
          title="Enabled Modules"
        />
        <FeatureListCard
          description="Stored Discord channel IDs for future runtime use."
          items={getConfiguredChannelItems(config)}
          title="Configured Channels"
        />
        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {quickLinks.map(([label, href, Icon]) => (
              <Button
                key={href}
                className="justify-start"
                variant="outline"
                render={<Link href={href} />}
              >
                <Icon aria-hidden data-icon="inline-start" />
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
            Toggle schema-backed module flags for this Discord server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ModuleFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            onChange={(key, checked) => {
              setValues((currentValues) => ({
                ...currentValues,
                [key]: checked,
              }))
              setSaveState("idle")
              setErrorMessage(null)
            }}
            values={values}
          />

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
          <ChannelPickerNotice />
          <ChannelFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            fields={CHANNEL_FIELDS}
            onChange={(key, value) => {
              setValues((currentValues) => ({
                ...currentValues,
                [key]: value,
              }))
              setSaveState("idle")
              setErrorMessage(null)
            }}
            values={values}
          />

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

function ModerationSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateModules = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateModules.update
  )
  const updateChannels = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateChannels.update
  )
  const [moderationEnabled, setModerationEnabled] = useState(
    overview.guildConfig?.moderationEnabled ?? false
  )
  const [channels, setChannels] = useState<
    Pick<ChannelValues, "modLogChannelId" | "logChannelId">
  >(() => ({
    modLogChannelId: overview.guildConfig?.modLogChannelId ?? "",
    logChannelId: overview.guildConfig?.logChannelId ?? "",
  }))
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
        modules: { moderationEnabled },
      })
      await updateChannels({
        discordGuildId: overview.discordGuildId,
        channels: {
          modLogChannelId: toOptionalChannelValue(channels.modLogChannelId),
          logChannelId: toOptionalChannelValue(channels.logChannelId),
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
          <CardTitle>Moderation</CardTitle>
          <CardDescription>
            Configure stored moderation settings without inventing live
            enforcement data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <IconInfoCircle aria-hidden />
            <AlertTitle>Runtime Enforcement Pending</AlertTitle>
            <AlertDescription>
              These settings prepare the dashboard config. Moderation actions
              and enforcement start only after the Discord bot runtime migration
              is complete.
            </AlertDescription>
          </Alert>

          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                aria-label="Moderation"
                checked={moderationEnabled}
                disabled={isBotLeft || saveState === "saving"}
                onCheckedChange={(checked) => {
                  setModerationEnabled(checked)
                  setSaveState("idle")
                  setErrorMessage(null)
                }}
              />
              <FieldContent>
                <FieldTitle>Moderation</FieldTitle>
                <FieldDescription>
                  Store whether moderation should be active for this server.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <ChannelFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            fields={MODERATION_CHANNEL_FIELDS}
            onChange={(key, value) => {
              setChannels((currentChannels) => ({
                ...currentChannels,
                [key]: value,
              }))
              setSaveState("idle")
              setErrorMessage(null)
            }}
            values={channels}
          />

          <SaveStatus state={saveState} errorMessage={errorMessage} />

          <div>
            <Button
              disabled={isBotLeft || saveState === "saving"}
              type="submit"
            >
              {saveState === "saving" ? "Saving…" : "Save Moderation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}

function AutomationSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateModules = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateModules.update
  )
  const updateChannels = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateChannels.update
  )
  const [welcomeEnabled, setWelcomeEnabled] = useState(
    overview.guildConfig?.welcomeEnabled ?? false
  )
  const [channels, setChannels] = useState<
    Pick<
      ChannelValues,
      "welcomeChannelId" | "updatesChannelId" | "announcementChannelId"
    >
  >(() => ({
    welcomeChannelId: overview.guildConfig?.welcomeChannelId ?? "",
    updatesChannelId: overview.guildConfig?.updatesChannelId ?? "",
    announcementChannelId: overview.guildConfig?.announcementChannelId ?? "",
  }))
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
        modules: { welcomeEnabled },
      })
      await updateChannels({
        discordGuildId: overview.discordGuildId,
        channels: {
          welcomeChannelId: toOptionalChannelValue(channels.welcomeChannelId),
          updatesChannelId: toOptionalChannelValue(channels.updatesChannelId),
          announcementChannelId: toOptionalChannelValue(
            channels.announcementChannelId
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
          <CardTitle>Automation</CardTitle>
          <CardDescription>
            Configure stored welcome and announcement destinations.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <IconInfoCircle aria-hidden />
            <AlertTitle>Automation Runtime Pending</AlertTitle>
            <AlertDescription>
              Welcome messages and announcements require the future Discord bot
              runtime. This page only saves schema-backed settings.
            </AlertDescription>
          </Alert>

          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                aria-label="Welcome automation"
                checked={welcomeEnabled}
                disabled={isBotLeft || saveState === "saving"}
                onCheckedChange={(checked) => {
                  setWelcomeEnabled(checked)
                  setSaveState("idle")
                  setErrorMessage(null)
                }}
              />
              <FieldContent>
                <FieldTitle>Welcome Automation</FieldTitle>
                <FieldDescription>
                  Store whether new member welcome handling should be enabled.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <ChannelFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            fields={AUTOMATION_CHANNEL_FIELDS}
            onChange={(key, value) => {
              setChannels((currentChannels) => ({
                ...currentChannels,
                [key]: value,
              }))
              setSaveState("idle")
              setErrorMessage(null)
            }}
            values={channels}
          />

          <SaveStatus state={saveState} errorMessage={errorMessage} />

          <div>
            <Button
              disabled={isBotLeft || saveState === "saving"}
              type="submit"
            >
              {saveState === "saving" ? "Saving…" : "Save Automation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}

function CommandsSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateModules = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateModules.update
  )
  const [values, setValues] = useState<
    Pick<ModuleValues, "aiEnabled" | "loggingEnabled">
  >(() => ({
    aiEnabled: overview.guildConfig?.aiEnabled ?? true,
    loggingEnabled: overview.guildConfig?.loggingEnabled ?? false,
  }))
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Commands</CardTitle>
            <CardDescription>
              Configure command readiness flags stored for this server.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Alert>
              <IconInfoCircle aria-hidden />
              <AlertTitle>Command Runtime Pending</AlertTitle>
              <AlertDescription>
                Command execution requires the future Discord bot migration.
                This page only controls stored readiness settings.
              </AlertDescription>
            </Alert>

            <FieldGroup>
              <Field orientation="horizontal">
                <Switch
                  aria-label="AI assistant commands"
                  checked={values.aiEnabled}
                  disabled={isBotLeft || saveState === "saving"}
                  onCheckedChange={(checked) => {
                    setValues((currentValues) => ({
                      ...currentValues,
                      aiEnabled: checked,
                    }))
                    setSaveState("idle")
                    setErrorMessage(null)
                  }}
                />
                <FieldContent>
                  <FieldTitle>AI Assistant Commands</FieldTitle>
                  <FieldDescription>
                    Store whether assistant command responses should be enabled.
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <Switch
                  aria-label="Command logging"
                  checked={values.loggingEnabled}
                  disabled={isBotLeft || saveState === "saving"}
                  onCheckedChange={(checked) => {
                    setValues((currentValues) => ({
                      ...currentValues,
                      loggingEnabled: checked,
                    }))
                    setSaveState("idle")
                    setErrorMessage(null)
                  }}
                />
                <FieldContent>
                  <FieldTitle>Command Logging</FieldTitle>
                  <FieldDescription>
                    Store whether command-related runtime events should be
                    logged.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>

            <SaveStatus state={saveState} errorMessage={errorMessage} />

            <div>
              <Button
                disabled={isBotLeft || saveState === "saving"}
                type="submit"
              >
                {saveState === "saving" ? "Saving…" : "Save Commands"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Command Readiness</CardTitle>
          <CardDescription>
            Runtime categories without pretending execution exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <ReadinessRow
              label="Assistant"
              ready={values.aiEnabled}
              value={values.aiEnabled ? "Configured" : "Disabled"}
            />
            <ReadinessRow
              label="Logging"
              ready={values.loggingEnabled}
              value={values.loggingEnabled ? "Configured" : "Disabled"}
            />
            <ReadinessRow
              label="Runtime"
              ready={false}
              value="Bot Migration Pending"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LogsSection({ discordGuildId }: { discordGuildId: string }) {
  const logsResult = useQuery(
    api.queries.dashboard.discord.guilds.systemLogs.list,
    { discordGuildId }
  )

  if (logsResult === undefined) {
    return (
      <div className="flex max-w-4xl flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (logsResult.status === "notFound") {
    return (
      <WorkspaceState
        description="This Discord server has not been synced to Cleo yet."
        icon={IconInfoCircle}
        title="Server Not Found"
      />
    )
  }

  if (logsResult.status === "forbidden") {
    return (
      <WorkspaceState
        description="Your signed-in Discord identity does not have verified management access for these logs."
        icon={IconAlertTriangle}
        title="Access Not Available"
      />
    )
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>System Logs</CardTitle>
        <CardDescription>
          Guild-scoped system errors only. Moderation and audit events are not
          available until Discord event ingestion exists.
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
                Discord server. This is not a moderation or audit log stream.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

function SettingsSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const config = overview.guildConfig

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Server Settings</CardTitle>
          <CardDescription>
            Read-only identity, access, and runtime status for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <OverviewField label="Server" value={overview.name} />
            <OverviewField
              label="Discord Guild ID"
              value={overview.discordGuildId}
            />
            <OverviewField
              label="Bot Status"
              value={getBotStatusLabel(isBotLeft, overview)}
            />
            <OverviewField
              label="Config Status"
              value={config ? "Created" : "Not Created"}
            />
            <OverviewField
              label="Management Access"
              value={overview.membership.isOwner ? "Owner" : "Manager"}
            />
            <OverviewField
              label="Verification Source"
              value={toTitleCase(
                overview.membership.managementVerificationSource ?? "not synced"
              )}
            />
            <OverviewField
              label="Member Count"
              value={formatNumber(overview.memberCount)}
            />
            <OverviewField
              label="Presence Count"
              value={formatNumber(overview.presenceCount)}
            />
            <OverviewField
              label="Last Synced"
              value={formatDateTime(overview.lastSyncedAt)}
            />
            <OverviewField
              label="Config Updated"
              value={formatDateTime(config?.updatedAt)}
            />
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <ConfigSummary config={config} />
        <Card>
          <CardHeader>
            <CardTitle>Safe Actions</CardTitle>
            <CardDescription>
              Destructive server removal is not available in this dashboard
              pass.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              className="justify-start"
              variant="outline"
              render={<Link href={`/dashboard/${overview.discordGuildId}`} />}
            >
              <IconListDetails aria-hidden data-icon="inline-start" />
              Open Overview
            </Button>
            <Button
              className="justify-start"
              variant="outline"
              render={
                <Link href={`/dashboard/${overview.discordGuildId}/channels`} />
              }
            >
              <IconHash aria-hidden data-icon="inline-start" />
              Edit Channels
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ModuleFieldGroup({
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

function ChannelFieldGroup<TChannelKey extends ChannelKey>({
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

function ChannelPickerNotice() {
  return (
    <Alert>
      <IconInfoCircle aria-hidden />
      <AlertTitle>Channel Picker Pending</AlertTitle>
      <AlertDescription>
        Channel lists will be selectable after Discord bot channel sync is
        wired. For now, save known Discord channel IDs.
      </AlertDescription>
    </Alert>
  )
}

function FeatureListCard({
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

function ReadinessRow({
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

function SystemLogRow({ isLast, log }: { isLast: boolean; log: GuildLog }) {
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

function BotStatusBadge({
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

function getModuleItems(config: GuildConfig | null) {
  if (!config) {
    return []
  }

  return MODULE_FIELDS.filter((module) => config[module.key]).map((module) => ({
    label: module.title,
  }))
}

function getConfiguredChannelItems(config: GuildConfig | null) {
  if (!config) {
    return []
  }

  return CHANNEL_FIELDS.flatMap((channel) => {
    const value = config[channel.key]

    return value ? [{ label: channel.title, value }] : []
  })
}

function getBotStatusLabel(
  isBotLeft: boolean,
  overview: GuildOverview
): string {
  if (isBotLeft) {
    return "Bot Left"
  }

  if (overview.botJoinedAt === undefined) {
    return "Runtime Pending"
  }

  return "Ready"
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

function toTitleCase(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Try again or refresh this workspace."
}
