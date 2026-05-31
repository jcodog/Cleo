"use client"

import {
  IconBolt,
  IconHash,
  IconLogs,
  IconSettings,
  IconShield,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "convex/react"
import Link from "next/link"

import {
  CHANNEL_FIELDS,
  MODULE_FIELDS,
  getConfiguredChannelItems,
} from "../lib/config"
import { formatDateTime, formatNumber } from "../lib/format"
import { GuildIcon, OverviewField } from "../components/workspace-ui"
import type { GuildConfig, GuildOverview } from "../types"

export function OverviewSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const config = overview.guildConfig
  const dashboardAuditResult = useQuery(
    api.queries.dashboard.discord.guilds.auditEvents.list,
    { discordGuildId: overview.discordGuildId, source: "dashboard" }
  )
  const healthItems = getSetupHealth(config)
  const recentEvents =
    dashboardAuditResult?.status === "ready"
      ? dashboardAuditResult.events.slice(0, 4)
      : []

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <GuildIcon iconUrl={overview.iconUrl} name={overview.name} />
              <div className="min-w-0">
                <h2 className="truncate font-heading text-xl font-medium">
                  {overview.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <BotBadge isBotLeft={isBotLeft} overview={overview} />
                  <Badge variant="outline">
                    {overview.membership.isOwner ? "Owner" : "Manager"}
                  </Badge>
                  {overview.memberCount !== undefined ? (
                    <Badge variant="outline">
                      {formatNumber(overview.memberCount)} members
                    </Badge>
                  ) : null}
                  {overview.presenceCount !== undefined ? (
                    <Badge variant="outline">
                      {formatNumber(overview.presenceCount)} online
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2 md:min-w-72">
              <OverviewField
                label="Last Sync"
                value={formatDateTime(overview.lastSyncedAt)}
              />
              <OverviewField
                label="Last Opened"
                value={formatDateTime(overview.lastOpenedAt)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Setup Health</CardTitle>
              <CardDescription>
                Current stored configuration for this server.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {healthItems.map((item) => (
                <div
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-3"
                  key={item.label}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Badge variant={item.ready ? "secondary" : "outline"}>
                    {item.value}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Dashboard Activity</CardTitle>
              <CardDescription>
                Changes made from Cleo dashboard surfaces.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardAuditResult === undefined ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : recentEvents.length > 0 ? (
                <div className="overflow-hidden rounded-lg border">
                  {recentEvents.map((event, index) => (
                    <div
                      className={
                        index === recentEvents.length - 1
                          ? "p-3"
                          : "border-b p-3"
                      }
                      key={event.auditEventId}
                    >
                      <p className="truncate text-sm font-medium">
                        {event.summary}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(event.occurredAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No dashboard activity has been recorded for this server yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <OverviewLink
                href={`/dashboard/${overview.discordGuildId}/channels`}
                icon={IconHash}
                label="Configure Channels"
              />
              <OverviewLink
                href={`/dashboard/${overview.discordGuildId}/modules`}
                icon={IconBolt}
                label="Configure Modules"
              />
              <OverviewLink
                href={`/dashboard/${overview.discordGuildId}/logs`}
                icon={IconLogs}
                label="Review Logs"
              />
              <OverviewLink
                href={`/dashboard/${overview.discordGuildId}/settings`}
                icon={IconSettings}
                label="Open Settings"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Technical Details</CardTitle>
              <CardDescription>
                IDs and timestamps used by dashboard access checks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <OverviewField
                  label="Discord Guild ID"
                  value={overview.discordGuildId}
                />
                <OverviewField
                  label="Access Verified"
                  value={formatDateTime(overview.membership.managementVerifiedAt)}
                />
                <OverviewField
                  label="Install Verified"
                  value={formatDateTime(overview.botInstallationVerifiedAt)}
                />
                <OverviewField
                  label="Gateway Joined"
                  value={formatDateTime(overview.botJoinedAt)}
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function OverviewLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof IconShield
  label: string
}) {
  return (
    <Link
      className={buttonVariants({
        variant: "outline",
        className: "justify-start",
      })}
      href={href}
    >
      <Icon aria-hidden data-icon="inline-start" />
      {label}
    </Link>
  )
}

function BotBadge({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  if (isBotLeft) {
    return <Badge variant="destructive">Bot Left</Badge>
  }

  if (overview.botJoinedAt !== undefined) {
    return <Badge variant="secondary">Gateway Synced</Badge>
  }

  if (overview.botInstallationVerifiedAt !== undefined) {
    return <Badge variant="secondary">Available</Badge>
  }

  return <Badge variant="outline">Pending Sync</Badge>
}

function getSetupHealth(config: GuildConfig | null) {
  const enabledModules = config
    ? MODULE_FIELDS.filter((module) => config[module.key]).length
    : 0
  const configuredChannels = getConfiguredChannelItems(config).length
  const hasLogChannel = Boolean(config?.logChannelId || config?.modLogChannelId)
  const hasAutomationChannel = Boolean(
    config?.welcomeChannelId ||
      config?.updatesChannelId ||
      config?.announcementChannelId
  )

  return [
    {
      label: "Modules",
      description: "Enabled stored module flags",
      value: `${enabledModules}/${MODULE_FIELDS.length}`,
      ready: enabledModules > 0,
    },
    {
      label: "Channels",
      description: "Configured Discord channel IDs",
      value: `${configuredChannels}/${CHANNEL_FIELDS.length}`,
      ready: configuredChannels > 0,
    },
    {
      label: "Logging",
      description: "Logging toggle and destination",
      value: config?.loggingEnabled && hasLogChannel ? "Ready" : "Not set",
      ready: Boolean(config?.loggingEnabled && hasLogChannel),
    },
    {
      label: "Moderation",
      description: "Moderation toggle and log channel",
      value:
        config?.moderationEnabled && Boolean(config.modLogChannelId)
          ? "Ready"
          : "Not set",
      ready: Boolean(config?.moderationEnabled && config.modLogChannelId),
    },
    {
      label: "Automation",
      description: "Welcome toggle and channel",
      value:
        config?.welcomeEnabled && hasAutomationChannel ? "Ready" : "Not set",
      ready: Boolean(config?.welcomeEnabled && hasAutomationChannel),
    },
  ]
}
