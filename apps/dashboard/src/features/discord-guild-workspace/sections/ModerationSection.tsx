"use client"

import { useState, type FormEvent } from "react"
import { IconShield } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

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
import { PolicyEditor } from "@/features/moderation/PolicyEditor"
import { MODERATION_ROLLOUT_LOCKED } from "@workspace/shared/moderation"

import { toOptionalChannelValue } from "../lib/config"
import { formatDateTime, getErrorMessage, toTitleCase } from "../lib/format"
import {
  DiscordChannelSelect,
  useDiscordConfigOptions,
} from "../components/ConfigSelectors"
import { SaveStatus } from "../components/workspace-ui"
import type { GuildModerationAction, GuildOverview, SaveState } from "../types"

/** Save moderation routing with pending/error feedback and disable configuration when the bot has left. */
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
  const optionsState = useDiscordConfigOptions(overview.discordGuildId)
  const [moderationEnabled, setModerationEnabled] = useState(
    !MODERATION_ROLLOUT_LOCKED &&
      (overview.guildConfig?.moderationEnabled ?? false)
  )
  const [modLogChannelId, setModLogChannelId] = useState(
    overview.guildConfig?.modLogChannelId ?? ""
  )
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
          modLogChannelId: toOptionalChannelValue(modLogChannelId),
        },
      })
      setSaveState("success")
    } catch (error) {
      setSaveState("error")
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <form className="max-w-2xl" onSubmit={handleSubmit}>
        <section
          className="min-w-0 space-y-5"
          aria-labelledby="moderation-heading"
        >
          <header className="space-y-2">
            <h2
              className="font-heading text-base font-medium"
              id="moderation-heading"
            >
              Moderation
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Configure stored moderation settings and log channels.
            </p>
          </header>
          <div className="flex flex-col gap-5">
            <FieldGroup>
              <Field orientation="horizontal">
                <Switch
                  aria-label="Moderation"
                  checked={moderationEnabled}
                  disabled={
                    MODERATION_ROLLOUT_LOCKED ||
                    isBotLeft ||
                    saveState === "saving"
                  }
                  onCheckedChange={(checked) => {
                    setModerationEnabled(checked)
                    setSaveState("idle")
                    setErrorMessage(null)
                  }}
                />
                <FieldContent>
                  <FieldTitle>Moderation</FieldTitle>
                  <FieldDescription>
                    Moderation cannot be enabled in this release.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>

            <DiscordChannelSelect
              description="Ban and kick outcomes are sent to this channel."
              disabled={isBotLeft || saveState === "saving"}
              label="Moderation log destination"
              onChange={(value) => {
                setModLogChannelId(value)
                setSaveState("idle")
                setErrorMessage(null)
              }}
              optionsState={optionsState}
              value={modLogChannelId}
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
          </div>
        </section>
      </form>

      <RecentModerationActions result={moderationActionsResult} />
      {isBotLeft ? null : (
        <PolicyEditor platform="discord" scopeId={overview.discordGuildId} />
      )}
    </div>
  )
}

/** Keep forbidden, missing, loading and empty moderation history distinct from stored actions. */
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
    <section
      className="min-w-0 space-y-5"
      aria-labelledby="recent-moderation-actions-heading"
    >
      <header className="space-y-2">
        <h2
          className="font-heading text-base font-medium"
          id="recent-moderation-actions-heading"
        >
          Recent Moderation Actions
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Stored ban and kick outcomes from the Discord bot runtime.
        </p>
      </header>
      <div className="space-y-5">
        {result?.status === "notFound" ? (
          <ModerationActionsEmpty
            description="This Discord server has not been synced to Cleo yet."
            title="Server Not Found"
          />
        ) : result?.status === "forbidden" ? (
          <ModerationActionsEmpty
            description="Your signed-in Discord identity does not have verified management access for these moderation records."
            title="Access Not Available"
          />
        ) : result === undefined ? (
          <ModerationActionsSkeleton />
        ) : result.status === "ready" && result.actions.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-0 border-y">
            {result.actions.map((action, index) => (
              <ModerationActionRow
                action={action}
                isLast={index === result.actions.length - 1}
                key={action.moderationActionId}
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-40 rounded-none px-0">
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
      </div>
    </section>
  )
}

function ModerationActionsEmpty({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <Empty className="min-h-40 rounded-none px-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconShield aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
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
