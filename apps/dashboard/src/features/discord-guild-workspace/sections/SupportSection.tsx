"use client"

import { IconLifebuoy } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useQuery } from "convex/react"

import {
  DiscordChannelSelect,
  DiscordRoleMultiSelect,
  useDiscordConfigOptions,
} from "../components/ConfigSelectors"
import { toTitleCase } from "../lib/format"
import {
  IconAlertTriangle,
  IconInfoCircle,
  WorkspaceState,
} from "../components/workspace-ui"
import type { GuildOverview } from "../types"

type SupportTargetType = "channel" | "thread" | "forum"
type TranscriptPolicy = "metadata-only" | "explicit-messages"
type EscalationPolicy = "none" | "jcn-product-only"

type SupportConfig = {
  enabled: boolean
  staffRoleIds: string[]
  targetId?: string
  targetType: SupportTargetType
  transcriptPolicy: TranscriptPolicy
  escalationPolicy: EscalationPolicy
  updatedAt: number
}

type GuildSupportTicket = {
  ticketId: string
  status: string
  requesterDiscordUserId: string
  transcriptPolicy: TranscriptPolicy
  escalationPolicy: EscalationPolicy
  openCount: number
  lastActivityAt: number
  createdAt: number
  latestMessage?: string
}

export function SupportSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const result = useQuery(api.queries.dashboard.discord.guilds.support.get, {
    discordGuildId: overview.discordGuildId,
  })

  if (result === undefined) {
    return (
      <div className="flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (result.status === "notFound") {
    return (
      <WorkspaceState
        description="This Discord server has not been synced to Cleo yet."
        icon={IconInfoCircle}
        title="Server Not Found"
      />
    )
  }

  if (result.status === "forbidden") {
    return (
      <WorkspaceState
        description="Verified server management access is required to view support."
        icon={IconAlertTriangle}
        title="Access Not Available"
      />
    )
  }

  return (
    <SupportWorkspace
      config={result.config}
      discordGuildId={overview.discordGuildId}
      isBotLeft={isBotLeft}
      tickets={result.tickets}
    />
  )
}

function SupportWorkspace({
  config,
  discordGuildId,
  isBotLeft,
  tickets,
}: {
  config: SupportConfig | null
  discordGuildId: string
  isBotLeft: boolean
  tickets: GuildSupportTicket[]
}) {
  const optionsState = useDiscordConfigOptions(discordGuildId)
  const disabled = true

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Guild Support Routing</CardTitle>
            <Badge variant="secondary">Temporarily disabled</Badge>
          </div>
          <CardDescription>
            Support tickets are temporarily unavailable while the feature is
            being rebuilt and tested. Existing configuration is shown read-only
            and cannot be changed or enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal" data-disabled={disabled}>
              <FieldContent>
                <FieldTitle>Enable guild support</FieldTitle>
                <FieldDescription>
                  `/help` support is disabled for guilds and direct messages.
                </FieldDescription>
              </FieldContent>
              <Switch
                aria-label="Enable guild support"
                checked={false}
                disabled
              />
            </Field>

            <DiscordChannelSelect
              description="Saved destination. Support routing is currently disabled."
              disabled
              label="Destination"
              onChange={() => undefined}
              optionsState={optionsState}
              value={config?.targetId ?? ""}
            />

            <Field data-disabled={disabled}>
              <FieldLabel htmlFor="support-target-type">
                Destination type
              </FieldLabel>
              <NativeSelect
                className="w-full"
                disabled
                id="support-target-type"
                value={config?.targetType ?? "channel"}
              >
                <NativeSelectOption value="channel">Text channel</NativeSelectOption>
                <NativeSelectOption value="thread">Thread</NativeSelectOption>
                <NativeSelectOption value="forum">Forum</NativeSelectOption>
              </NativeSelect>
            </Field>

            <DiscordRoleMultiSelect
              disabled
              onChange={() => undefined}
              optionsState={optionsState}
              value={config?.staffRoleIds ?? []}
            />

            <Field data-disabled={disabled}>
              <FieldLabel htmlFor="support-transcript">
                Transcript policy
              </FieldLabel>
              <NativeSelect
                className="w-full"
                disabled
                id="support-transcript"
                value={config?.transcriptPolicy ?? "explicit-messages"}
              >
                <NativeSelectOption value="explicit-messages">
                  Store messages submitted through /help
                </NativeSelectOption>
                <NativeSelectOption value="metadata-only">
                  Metadata only
                </NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field data-disabled={disabled}>
              <FieldLabel htmlFor="support-escalation">
                JCN escalation
              </FieldLabel>
              <NativeSelect
                className="w-full"
                disabled
                id="support-escalation"
                value={config?.escalationPolicy ?? "jcn-product-only"}
              >
                <NativeSelectOption value="jcn-product-only">
                  Cleo product issues only
                </NativeSelectOption>
                <NativeSelectOption value="none">No escalation</NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                Server moderation disputes are never routed to JCN support.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled type="button">
              Save Support Routing
            </Button>
            <p className="text-sm text-muted-foreground">
              Configuration changes are disabled until the replacement support
              flow has been fully implemented and tested.
            </p>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guild Support Tickets</CardTitle>
          <CardDescription>
            Existing support records remain available for review while new
            `/help` requests are disabled.
            {isBotLeft ? " Cleo is no longer in this server." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GuildSupportTicketList tickets={tickets} />
        </CardContent>
      </Card>
    </div>
  )
}

function GuildSupportTicketList({
  tickets,
}: {
  tickets: GuildSupportTicket[]
}) {
  if (tickets.length === 0) {
    return (
      <Empty className="min-h-56 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconLifebuoy aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No Support Tickets</EmptyTitle>
          <EmptyDescription>
            New `/help` requests are temporarily disabled.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requester</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Latest submitted message</TableHead>
            <TableHead className="text-right">Last activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.ticketId}>
              <TableCell className="font-mono text-xs">
                {ticket.requesterDiscordUserId}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{toTitleCase(ticket.status)}</Badge>
              </TableCell>
              <TableCell className="max-w-md whitespace-normal">
                {ticket.latestMessage ?? "No stored message"}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(ticket.lastActivityAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
