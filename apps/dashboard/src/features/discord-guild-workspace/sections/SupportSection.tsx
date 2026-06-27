"use client"

import { useState, type FormEvent } from "react"
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
import { Input } from "@workspace/ui/components/input"
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
import { useMutation, useQuery } from "convex/react"

import { getErrorMessage, toTitleCase } from "../lib/format"
import {
  IconAlertTriangle,
  IconInfoCircle,
  SaveStatus,
  WorkspaceState,
} from "../components/workspace-ui"
import type { GuildOverview, SaveState } from "../types"

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
        description="Verified server management access is required to configure support."
        icon={IconAlertTriangle}
        title="Access Not Available"
      />
    )
  }

  return (
    <SupportWorkspace
      key={result.config?.updatedAt ?? "new"}
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
  const updateSupport = useMutation(
    api.mutations.dashboard.discord.guildSupportConfigs.update.update
  )
  const [enabled, setEnabled] = useState(config?.enabled ?? false)
  const [targetId, setTargetId] = useState(config?.targetId ?? "")
  const [targetType, setTargetType] = useState<SupportTargetType>(
    config?.targetType ?? "channel"
  )
  const [staffRoleIds, setStaffRoleIds] = useState(
    config?.staffRoleIds.join(", ") ?? ""
  )
  const [transcriptPolicy, setTranscriptPolicy] = useState<TranscriptPolicy>(
    config?.transcriptPolicy ?? "explicit-messages"
  )
  const [escalationPolicy, setEscalationPolicy] = useState<EscalationPolicy>(
    config?.escalationPolicy ?? "jcn-product-only"
  )
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const disabled = isBotLeft || saveState === "saving"

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (disabled) {
      return
    }

    setSaveState("saving")
    setErrorMessage(null)

    try {
      await updateSupport({
        discordGuildId,
        enabled,
        targetId: targetId.trim() || null,
        targetType,
        staffRoleIds: staffRoleIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        transcriptPolicy,
        escalationPolicy,
      })
      setSaveState("success")
    } catch (error) {
      setSaveState("error")
      setErrorMessage(getErrorMessage(error))
    }
  }

  function markDirty() {
    setSaveState("idle")
    setErrorMessage(null)
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Guild Support Routing</CardTitle>
            <CardDescription>
              Route `/help` requests from this server to a private Discord
              destination managed by your support team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="horizontal" data-disabled={disabled}>
                <FieldContent>
                  <FieldTitle>Enable guild support</FieldTitle>
                  <FieldDescription>
                    When disabled, `/help` directs members to ask an admin to
                    configure support.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  aria-label="Enable guild support"
                  checked={enabled}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    setEnabled(checked)
                    markDirty()
                  }}
                />
              </Field>

              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="support-target">Destination ID</FieldLabel>
                <Input
                  disabled={disabled}
                  id="support-target"
                  inputMode="numeric"
                  onChange={(event) => {
                    setTargetId(event.target.value)
                    markDirty()
                  }}
                  placeholder="Discord channel, thread, or forum ID"
                  value={targetId}
                />
                <FieldDescription>
                  Cleo posts new and resumed requests only to this destination.
                </FieldDescription>
              </Field>

              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="support-target-type">
                  Destination type
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  disabled={disabled}
                  id="support-target-type"
                  onChange={(event) => {
                    setTargetType(event.target.value as SupportTargetType)
                    markDirty()
                  }}
                  value={targetType}
                >
                  <NativeSelectOption value="channel">
                    Text channel
                  </NativeSelectOption>
                  <NativeSelectOption value="thread">Thread</NativeSelectOption>
                  <NativeSelectOption value="forum">Forum</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="support-roles">
                  Support staff role IDs
                </FieldLabel>
                <Input
                  disabled={disabled}
                  id="support-roles"
                  onChange={(event) => {
                    setStaffRoleIds(event.target.value)
                    markDirty()
                  }}
                  placeholder="Comma-separated Discord role IDs"
                  value={staffRoleIds}
                />
                <FieldDescription>
                  New requests mention only these configured roles.
                </FieldDescription>
              </Field>

              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="support-transcript">
                  Transcript policy
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  disabled={disabled}
                  id="support-transcript"
                  onChange={(event) => {
                    setTranscriptPolicy(event.target.value as TranscriptPolicy)
                    markDirty()
                  }}
                  value={transcriptPolicy}
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
                  disabled={disabled}
                  id="support-escalation"
                  onChange={(event) => {
                    setEscalationPolicy(event.target.value as EscalationPolicy)
                    markDirty()
                  }}
                  value={escalationPolicy}
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

              <SaveStatus errorMessage={errorMessage} state={saveState} />
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={disabled} type="submit">
              {saveState === "saving" ? "Saving…" : "Save Support Routing"}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Guild Support Tickets</CardTitle>
          <CardDescription>
            Private requests routed from this server through `/help`.
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
            Member requests submitted through `/help` will appear here.
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
