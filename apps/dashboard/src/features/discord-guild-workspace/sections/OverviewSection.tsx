import {
  IconBolt,
  IconCommand,
  IconLogs,
  IconSettings,
  IconShield,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import Link from "next/link"

import { getConfiguredChannelItems, getModuleItems } from "../lib/config"
import { formatDateTime, formatNumber, getBotStatusLabel } from "../lib/format"
import {
  ConfigSummary,
  FeatureListCard,
  OverviewField,
} from "../components/workspace-ui"
import type { GuildOverview } from "../types"

export function OverviewSection({
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
          description="Stored Discord channel IDs for future REST/runtime use."
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
