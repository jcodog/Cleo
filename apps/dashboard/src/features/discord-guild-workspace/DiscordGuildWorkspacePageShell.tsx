"use client"

import { useEffect, useRef } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { Id } from "@workspace/backend/convex/_generated/dataModel.js"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { useMutation, useQuery } from "convex/react"

import {
  BotStatusBadge,
  GuildIcon,
  IconAlertTriangle,
  IconInfoCircle,
  RuntimeNotice,
  WorkspaceSkeleton,
  WorkspaceState,
} from "./components/workspace-ui"
import { AutomationSection } from "./sections/AutomationSection"
import { ChannelsSection } from "./sections/ChannelsSection"
import { CommandsSection } from "./sections/CommandsSection"
import { LogsSection } from "./sections/LogsSection"
import { ModerationSection } from "./sections/ModerationSection"
import { ModulesSection } from "./sections/ModulesSection"
import { OverviewSection } from "./sections/OverviewSection"
import { SettingsSection } from "./sections/SettingsSection"
import {
  DISCORD_GUILD_SECTION_TITLES,
  type DiscordGuildSection,
} from "./sections"
import type { GuildOverview } from "./types"

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

      {overview.botJoinedAt === undefined &&
      overview.botInstallationVerifiedAt === undefined &&
      !isBotLeft ? (
        <RuntimeNotice />
      ) : null}

      <WorkspaceSection
        isBotLeft={isBotLeft}
        overview={overview}
        section={section}
      />
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

function WorkspaceSection({
  isBotLeft,
  overview,
  section,
}: {
  isBotLeft: boolean
  overview: GuildOverview
  section: DiscordGuildSection
}) {
  const sectionKey = `${overview.discordGuildId}:${section}:${
    overview.guildConfig?.updatedAt ?? "no-config"
  }`

  switch (section) {
    case "overview":
      return <OverviewSection isBotLeft={isBotLeft} overview={overview} />
    case "modules":
      return (
        <ModulesSection
          key={sectionKey}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      )
    case "channels":
      return (
        <ChannelsSection
          key={sectionKey}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      )
    case "moderation":
      return (
        <ModerationSection
          key={sectionKey}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      )
    case "automation":
      return (
        <AutomationSection
          key={sectionKey}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      )
    case "commands":
      return (
        <CommandsSection
          key={sectionKey}
          isBotLeft={isBotLeft}
          overview={overview}
        />
      )
    case "logs":
      return <LogsSection discordGuildId={overview.discordGuildId} />
    case "settings":
      return <SettingsSection isBotLeft={isBotLeft} overview={overview} />
  }
}
