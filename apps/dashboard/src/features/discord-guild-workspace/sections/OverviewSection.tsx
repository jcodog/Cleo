"use client"

import { api } from "@workspace/backend/convex/_generated/api.js"
import { Badge } from "@workspace/ui/components/badge"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "convex/react"
import Link from "next/link"

import { formatDateTime } from "../lib/format"
import type { GuildOverview } from "../types"
import { useLiveNotifications } from "./useLiveNotifications"
import { getLiveNotificationState } from "../lib/liveNotifications"

/** Link each feature's persisted readiness to its settings without duplicating navigation. */
export function OverviewSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const live = useLiveNotifications(overview.discordGuildId)
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
    <div className="flex max-w-5xl flex-col gap-10">
      <section
        className="max-w-2xl min-w-0 space-y-5"
        aria-labelledby="cleo-status-heading"
      >
        <header className="space-y-2">
          <h2
            className="font-heading text-base font-medium"
            id="cleo-status-heading"
          >
            Cleo status
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isBotLeft
              ? "Cleo cannot run features or accept configuration changes for this server."
              : "Cleo is available for the configured Discord features below."}
          </p>
        </header>
        <div className="space-y-5">
          <div className="flex flex-col divide-y">
            <FeatureState
              enabled={
                getLiveNotificationState(live.view, live.error) === "Ready"
              }
              href={`/dashboard/${overview.discordGuildId}/live-notifications`}
              label="Live notifications"
              stateLabel={getLiveNotificationState(live.view, live.error)}
            />
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
        </div>
      </section>

      <section
        className="min-w-0 space-y-5"
        aria-labelledby="recent-configuration-changes-heading"
      >
        <header className="space-y-2">
          <h2
            className="font-heading text-base font-medium"
            id="recent-configuration-changes-heading"
          >
            Recent configuration changes
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Audit records created by dashboard actions.
          </p>
        </header>
        <div className="space-y-5">
          {dashboardAuditResult === undefined ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : recentEvents.length > 0 ? (
            <div className="min-w-0 border-y">
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
        </div>
      </section>
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
      className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary"
      href={href}
    >
      <span className="font-medium">{label}</span>
      <Badge variant={enabled ? "secondary" : "outline"}>
        {stateLabel ?? (enabled ? "Enabled" : "Disabled")}
      </Badge>
    </Link>
  )
}
