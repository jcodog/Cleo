"use client"

import { IconLifebuoy } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

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

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"

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

/** Preserve saved routing and ticket visibility while the replacement support flow keeps every edit disabled. */
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
    <div className="flex max-w-5xl flex-col gap-10">
      <Alert className="rounded-none border-0 border-l-2 bg-transparent py-0">
        <IconInfoCircle aria-hidden />
        <AlertTitle>Support is temporarily unavailable</AlertTitle>
        <AlertDescription>
          We&apos;ve temporarily disabled new `/help` requests and support
          configuration while we rebuild the feature. Support will return in a
          future Cleo update once the replacement flow has been fully
          implemented and tested. Existing ticket records remain available
          below.
        </AlertDescription>
      </Alert>

      <section
        className="max-w-2xl space-y-5"
        aria-labelledby="guild-support-routing-heading"
      >
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className="font-heading text-base font-medium"
              id="guild-support-routing-heading"
            >
              Guild Support Routing
            </h2>
            <Badge variant="secondary">Temporarily disabled</Badge>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Review the server&apos;s saved support routing configuration.
            Configuration changes cannot currently be made.
          </p>
        </header>
        <div className="space-y-5">
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
                <NativeSelectOption value="channel">
                  Text channel
                </NativeSelectOption>
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
                <NativeSelectOption value="none">
                  No escalation
                </NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                Server moderation disputes are never routed to JCN support.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled type="button">
              Save Support Routing
            </Button>
            <p className="text-sm text-muted-foreground">
              Configuration changes are disabled until the replacement support
              flow has been fully implemented and tested.
            </p>
          </div>
        </div>
      </section>

      <section
        className="min-w-0 space-y-5"
        aria-labelledby="guild-support-tickets-heading"
      >
        <header className="space-y-2">
          <h2
            className="font-heading text-base font-medium"
            id="guild-support-tickets-heading"
          >
            Guild Support Tickets
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Existing support records remain available for review while new
            `/help` requests are disabled.
            {isBotLeft ? " Cleo is no longer in this server." : ""}
          </p>
        </header>
        <div className="space-y-5">
          <GuildSupportTicketList tickets={tickets} />
        </div>
      </section>
    </div>
  )
}

/** Render existing ticket records, keeping a missing message explicit and new requests unavailable. */
function GuildSupportTicketList({
  tickets,
}: {
  tickets: GuildSupportTicket[]
}) {
  if (tickets.length === 0) {
    return (
      <Empty className="min-h-40 rounded-none px-0">
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
    <div className="min-w-0 border-y">
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
