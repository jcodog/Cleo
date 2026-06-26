"use client"

import { useState, type FormEvent } from "react"
import { IconInfoCircle, IconShield } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
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
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import { useMutation, useQuery } from "convex/react"

import {
  MODERATION_CHANNEL_FIELDS,
  toOptionalChannelValue,
  type ChannelValues,
} from "../lib/config"
import { formatDateTime, getErrorMessage, toTitleCase } from "../lib/format"
import { ChannelFieldGroup, SaveStatus } from "../components/workspace-ui"
import type { GuildModerationAction, GuildOverview, SaveState } from "../types"

export function ModerationSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateWorkspaceSection = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection.update
  )
  const moderationActionsResult = useQuery(
    api.queries.dashboard.discord.guilds.moderationActions.list,
    { discordGuildId: overview.discordGuildId }
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
      await updateWorkspaceSection({
        discordGuildId: overview.discordGuildId,
        modules: { moderationEnabled },
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
    <div className="flex max-w-5xl flex-col gap-6">
      <form className="max-w-3xl" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Moderation</CardTitle>
            <CardDescription>
              Configure stored moderation settings and log channels.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Alert>
              <IconInfoCircle aria-hidden />
              <AlertTitle>Runtime Enforcement</AlertTitle>
              <AlertDescription>
                Ban and kick commands follow these settings when the bot is
                present in this server.
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
                    Allow Cleo to run configured moderation commands.
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

      <RecentModerationActions result={moderationActionsResult} />
    </div>
  )
}

function RecentModerationActions({
  result,
}: {
  result:
    | {
        status: "ready"
        actions: GuildModerationAction[]
      }
    | {
        status: "notFound" | "forbidden"
      }
    | undefined
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Moderation Actions</CardTitle>
        <CardDescription>
          Stored ban and kick outcomes from the Discord bot runtime.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result === undefined ? (
          <ModerationActionsSkeleton />
        ) : result.status === "ready" && result.actions.length > 0 ? (
          <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
            {result.actions.map((action, index) => (
              <ModerationActionRow
                action={action}
                isLast={index === result.actions.length - 1}
                key={action.moderationActionId}
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconShield aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No Moderation Actions</EmptyTitle>
              <EmptyDescription>
                Ban and kick command outcomes will appear here after moderators
                use them in Discord.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

function ModerationActionRow({
  action,
  isLast,
}: {
  action: GuildModerationAction
  isLast: boolean
}) {
  return (
    <div className={isLast ? "p-3" : "border-b p-3"}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {toTitleCase(action.actionType)} {toTitleCase(action.result)}
          </p>
          <p className="mt-1 text-xs break-all text-muted-foreground">
            {action.actorDiscordUserId} -&gt; {action.targetDiscordUserId}
          </p>
          {action.reason ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {action.reason}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-start gap-2 sm:justify-end">
          <Badge variant={getResultBadgeVariant(action.result)}>
            {toTitleCase(action.result)}
          </Badge>
          {action.failureCode ? (
            <Badge variant="outline">{toTitleCase(action.failureCode)}</Badge>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatDateTime(action.occurredAt)}
      </p>
    </div>
  )
}

function ModerationActionsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

function getResultBadgeVariant(
  result: GuildModerationAction["result"]
): "default" | "secondary" | "destructive" | "outline" {
  if (result === "failed") {
    return "destructive"
  }

  if (result === "denied") {
    return "secondary"
  }

  return "outline"
}
