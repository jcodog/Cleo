import { IconHash, IconListDetails } from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import Link from "next/link"

import { formatDateTime, formatNumber, toTitleCase } from "../lib/format"
import {
  ConfigSummary,
  OverviewField,
  BotStatusFields,
} from "../components/workspace-ui"
import type { GuildOverview } from "../types"

export function SettingsSection({
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
            <BotStatusFields isBotLeft={isBotLeft} overview={overview} />
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
            <Link
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
              href={`/dashboard/${overview.discordGuildId}`}
            >
              <IconListDetails aria-hidden data-icon="inline-start" />
              Open Overview
            </Link>
            <Link
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
              href={`/dashboard/${overview.discordGuildId}/channels`}
            >
              <IconHash aria-hidden data-icon="inline-start" />
              Edit Channels
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
