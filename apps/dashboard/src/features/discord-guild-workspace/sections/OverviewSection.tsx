"use client"

import {
  IconLifebuoy,
  IconLogs,
  IconShield,
  IconSparkles,
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

import { BotStatusBadge } from "../components/workspace-ui"
import { formatDateTime } from "../lib/format"
import type { GuildOverview } from "../types"

export function OverviewSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const dashboardAuditResult = useQuery(
    api.queries.dashboard.discord.guilds.auditEvents.list,
    { discordGuildId: overview.discordGuildId, source: "dashboard" }
  )
  const supportResult = useQuery(
    api.queries.dashboard.discord.guilds.support.get,
    { discordGuildId: overview.discordGuildId }
  )
  const recentEvents =
    dashboardAuditResult?.status === "ready"
      ? dashboardAuditResult.events.slice(0, 5)
      : []

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Cleo status</CardTitle>
            <BotStatusBadge isBotLeft={isBotLeft} overview={overview} />
          </div>
          <CardDescription>
            {isBotLeft
              ? "Cleo cannot run features or accept configuration changes for this server."
              : "Cleo is available for the configured Discord features below."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <FeatureState
              enabled={
                overview.guildConfig?.welcomeEnabled === true &&
                overview.guildConfig.welcomeChannelId !== undefined
              }
              href={`/dashboard/${overview.discordGuildId}/welcome`}
              label="Welcome"
              stateLabel={getConfiguredFeatureState(
                overview.guildConfig?.welcomeEnabled ?? false,
                overview.guildConfig?.welcomeChannelId
              )}
            />
            <FeatureState
              enabled={
                overview.guildConfig?.moderationEnabled === true &&
                overview.guildConfig.modLogChannelId !== undefined
              }
              href={`/dashboard/${overview.discordGuildId}/moderation`}
              label="Moderation"
              stateLabel={getConfiguredFeatureState(
                overview.guildConfig?.moderationEnabled ?? false,
                overview.guildConfig?.modLogChannelId
              )}
            />
            <FeatureState
              enabled={
                overview.guildConfig?.loggingEnabled === true &&
                overview.guildConfig.logChannelId !== undefined
              }
              href={`/dashboard/${overview.discordGuildId}/logs`}
              label="Logging"
              stateLabel={getConfiguredFeatureState(
                overview.guildConfig?.loggingEnabled ?? false,
                overview.guildConfig?.logChannelId
              )}
            />
            <FeatureState
              enabled={
                supportResult?.status === "ready" &&
                supportResult.config?.enabled === true &&
                supportResult.config.targetId !== undefined
              }
              href={`/dashboard/${overview.discordGuildId}/support`}
              label="Support"
              stateLabel={
                supportResult === undefined
                  ? "Loading"
                  : supportResult.status === "ready"
                    ? getConfiguredFeatureState(
                        supportResult.config?.enabled ?? false,
                        supportResult.config?.targetId
                      )
                    : "Unavailable"
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <OverviewLink
            href={`/dashboard/${overview.discordGuildId}/welcome`}
            icon={IconSparkles}
            label="Welcome"
          />
          <OverviewLink
            href={`/dashboard/${overview.discordGuildId}/moderation`}
            icon={IconShield}
            label="Moderation"
          />
          <OverviewLink
            href={`/dashboard/${overview.discordGuildId}/support`}
            icon={IconLifebuoy}
            label="Support"
          />
          <OverviewLink
            href={`/dashboard/${overview.discordGuildId}/logs`}
            icon={IconLogs}
            label="Logs"
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Recent configuration changes</CardTitle>
          <CardDescription>
            Audit records created by dashboard actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardAuditResult === undefined ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : recentEvents.length > 0 ? (
            <div className="overflow-hidden rounded-lg border">
              {recentEvents.map((event, index) => (
                <div
                  className={
                    index === recentEvents.length - 1 ? "p-3" : "border-b p-3"
                  }
                  key={event.auditEventId}
                >
                  <p className="text-sm font-medium">{event.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.occurredAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No dashboard changes have been recorded for this server.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function getConfiguredFeatureState(
  enabled: boolean,
  requiredTarget: string | undefined
): string {
  if (!enabled) {
    return "Disabled"
  }

  return requiredTarget ? "Ready" : "Needs Channel"
}

function FeatureState({
  enabled,
  href,
  label,
  stateLabel,
}: {
  enabled: boolean
  href: string
  label: string
  stateLabel?: string
}) {
  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
      href={href}
    >
      <span className="font-medium">{label}</span>
      <Badge variant={enabled ? "secondary" : "outline"}>
        {stateLabel ?? (enabled ? "Enabled" : "Disabled")}
      </Badge>
    </Link>
  )
}

function OverviewLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof IconLogs
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
