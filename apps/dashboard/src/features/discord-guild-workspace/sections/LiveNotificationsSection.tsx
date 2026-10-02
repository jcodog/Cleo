"use client"

import { useState, type FormEvent } from "react"
import { useClerk } from "@clerk/nextjs"
import { useAction } from "convex/react"
import Link from "next/link"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { IconBrandTwitch } from "@tabler/icons-react"
import {
  DiscordChannelSelect,
  DiscordRoleSelect,
  useDiscordConfigOptions,
} from "../components/ConfigSelectors"
import {
  useLiveNotifications,
  type LiveNotificationsView,
} from "./useLiveNotifications"
import {
  getLiveNotificationState,
  getTwitchSourceFeedback,
} from "../lib/liveNotifications"
import { SaveStatus } from "../components/workspace-ui"
import { getErrorMessage } from "../lib/format"
import type { GuildOverview, SaveState } from "../types"

export function LiveNotificationsSection({
  overview,
  isBotLeft,
}: {
  overview: GuildOverview
  isBotLeft: boolean
}) {
  const { view, error, reload } = useLiveNotifications(overview.discordGuildId)
  if (error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        Connection verification is temporarily unavailable. Try again later.
        <Button onClick={reload}>Retry provider check</Button>
        {view?.isOwner && (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/twitch"
          >
            Manage Twitch
          </Link>
        )}
      </div>
    )
  if (!view) return <Skeleton className="h-48 w-full max-w-3xl" />
  return (
    <LiveNotificationsForm
      key={overview.discordGuildId}
      discordGuildId={overview.discordGuildId}
      isBotLeft={isBotLeft || view.botLeft}
      view={view}
      reload={reload}
    />
  )
}

function LiveNotificationsForm({
  discordGuildId,
  isBotLeft,
  view,
  reload,
}: {
  discordGuildId: string
  isBotLeft: boolean
  view: LiveNotificationsView
  reload: () => void
}) {
  const clerk = useClerk()
  const update = useAction(api.liveNotificationActions.update)
  const [selectorRevision, setSelectorRevision] = useState(0)
  const options = useDiscordConfigOptions(discordGuildId, selectorRevision)
  const [enabled, setEnabled] = useState(view.config.liveNotificationsEnabled)
  const [channelId, setChannelId] = useState(
    "liveNotificationChannelId" in view.config
      ? (view.config.liveNotificationChannelId ?? "")
      : ""
  )
  const [mode, setMode] = useState<"none" | "everyone" | "role">(
    view.config.liveNotificationMentionMode
  )
  const [roleId, setRoleId] = useState(
    "liveNotificationRoleId" in view.config
      ? (view.config.liveNotificationRoleId ?? "")
      : ""
  )
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [persisted, setPersisted] = useState({
    channelId: view.config.liveNotificationChannelId ?? "",
    mode: view.config.liveNotificationMentionMode,
    roleId: view.config.liveNotificationRoleId ?? "",
  })
  const dirty =
    channelId !== persisted.channelId ||
    mode !== persisted.mode ||
    (mode === "role" ? roleId : "") !==
      (persisted.mode === "role" ? persisted.roleId : "")
  const valid =
    options.status === "ready" &&
    options.options.channels.some(
      (channel) =>
        channel.id === channelId &&
        (channel.type === "text" || channel.type === "announcement")
    ) &&
    (mode !== "role" ||
      options.options.roles.some(
        (role) => role.id === roleId && role.name !== "@everyone"
      ))
  const configRevision = "updatedAt" in view.config ? view.config.updatedAt : 0
  const [remoteRevision, setRemoteRevision] = useState(configRevision)
  if (!dirty && saveState !== "saving" && configRevision > remoteRevision) {
    setEnabled(view.config.liveNotificationsEnabled)
    setChannelId(view.config.liveNotificationChannelId ?? "")
    setMode(view.config.liveNotificationMentionMode)
    setRoleId(view.config.liveNotificationRoleId ?? "")
    setRemoteRevision(configRevision)
    setPersisted({
      channelId: view.config.liveNotificationChannelId ?? "",
      mode: view.config.liveNotificationMentionMode,
      roleId: view.config.liveNotificationRoleId ?? "",
    })
  }
  const disabled = isBotLeft || saveState === "saving"
  const sourceReady = view.source.status === "ready"
  const feedback = getTwitchSourceFeedback(view.source.status)
  const destinations =
    options.status === "ready"
      ? {
          ...options,
          options: {
            ...options.options,
            channels: options.options.channels.filter(
              (channel) =>
                channel.type === "text" || channel.type === "announcement"
            ),
          },
        }
      : options
  const markDirty = () => {
    setSaveState("idle")
    setError(null)
  }
  async function persist(
    nextEnabled: boolean,
    useDraft: boolean,
    retry = false
  ) {
    if (disabled || (useDraft && !valid)) return
    setSaveState("saving")
    setError(null)
    try {
      const savedRevision = await update({
        discordGuildId,
        liveNotificationsEnabled: nextEnabled,
        ...(retry ? { retry: true } : {}),
        liveNotificationChannelId:
          (useDraft ? channelId : persisted.channelId) || undefined,
        liveNotificationMentionMode: useDraft ? mode : persisted.mode,
        liveNotificationRoleId:
          (useDraft ? mode : persisted.mode) === "role"
            ? (useDraft ? roleId : persisted.roleId) || undefined
            : undefined,
      })
      setSaveState("success")
      setRemoteRevision(savedRevision)
      setEnabled(nextEnabled)
      if (useDraft) setPersisted({ channelId, mode, roleId })
    } catch (failure) {
      setSaveState("error")
      setError(getErrorMessage(failure))
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dirty) await persist(enabled, true)
  }
  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={save}>
      {options.status === "unavailable" && (
        <Button
          type="button"
          onClick={() => setSelectorRevision((value) => value + 1)}
        >
          Retry Discord selectors
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="font-heading text-lg font-medium">
            Live notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Let your server know when its owner's Twitch channel goes live.
          </p>
          <p className="text-sm text-muted-foreground">
            Destination and mention settings apply to this Discord server.
            Twitch connection and chat announcements are managed in the owner's
            Twitch account workspace.
          </p>
        </div>
        <Badge variant="outline">{getLiveNotificationState(view)}</Badge>
      </div>
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage
            src={
              view.source.status === "ready" ? view.source.avatarUrl : undefined
            }
            alt="Server owner's Twitch avatar"
          />
          <AvatarFallback>
            <IconBrandTwitch aria-hidden />
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">
            {view.source.status === "ready"
              ? view.source.displayName
              : "Server owner's Twitch channel"}
          </p>
          <p className="text-sm text-muted-foreground">
            {view.source.status === "ready"
              ? `twitch.tv/${view.source.login} · Linked to the server owner`
              : feedback.description}
          </p>
        </div>
      </div>
      {view.isOwner && (
        <div className="flex flex-wrap gap-3">
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/twitch"
          >
            Manage Twitch
          </Link>
          {(feedback.recovery === "connect" ||
            feedback.recovery === "reconnect") && (
            <Link className={buttonVariants()} href="/twitch">
              {feedback.recovery === "connect"
                ? "Connect Twitch"
                : "Reconnect Twitch"}
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => clerk.openUserProfile()}
          >
            Manage account
          </Button>
        </div>
      )}
      {feedback.recovery === "retry" && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={reload}
        >
          Retry provider check
        </Button>
      )}
      {!view.isOwner &&
        (feedback.recovery === "connect" ||
          feedback.recovery === "reconnect") && (
          <p className="text-sm text-muted-foreground">
            Ask the server owner to open Cleo's Twitch connection page. Your
            linked Twitch account cannot be used for this server.
          </p>
        )}
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="live-enabled" className="text-sm font-medium">
          Twitch live notifications
        </label>
        <Switch
          id="live-enabled"
          checked={enabled}
          disabled={disabled || (!enabled && (!sourceReady || !valid))}
          onCheckedChange={(checked) => {
            if (checked && !sourceReady) return
            void persist(checked, checked)
          }}
        />
      </div>
      <DiscordChannelSelect
        description="Choose a text or announcement channel where Cleo can send messages."
        disabled={disabled}
        label="Destination"
        optionsState={destinations}
        value={channelId}
        onChange={(value) => {
          setChannelId(value)
          markDirty()
        }}
      />
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="live-mention-mode">
          Mention
        </label>
        <Select
          disabled={disabled}
          value={mode}
          onValueChange={(value) => {
            if (value === "none" || value === "everyone" || value === "role") {
              setMode(value)
              if (value !== "role") setRoleId("")
              markDirty()
            }
          }}
        >
          <SelectTrigger id="live-mention-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="everyone">@everyone</SelectItem>
            <SelectItem value="role">Custom role</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Only the selected mention is permitted. Stream titles cannot mention
          members or roles.
        </p>
      </div>
      {mode === "role" && (
        <DiscordRoleSelect
          disabled={disabled}
          optionsState={options}
          value={roleId}
          onChange={(value) => {
            setRoleId(value)
            markDirty()
          }}
        />
      )}
      {options.status === "unavailable" && (
        <p role="alert" className="text-sm text-muted-foreground">
          Discord channels and roles are unavailable. Cleo must be present and
          able to access this server.
        </p>
      )}
      {view.subscriptionStatus !== "ready" && enabled && sourceReady && (
        <p role="status" className="text-sm text-muted-foreground">
          {view.subscriptionStatus === "connecting"
            ? "Twitch is confirming the live-event subscription."
            : "The Twitch subscription is unavailable. Retry the subscription or try again later."}
        </p>
      )}
      <SaveStatus state={saveState} errorMessage={error} />
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={
            disabled ||
            !dirty ||
            !valid ||
            (enabled &&
              (!sourceReady || options.status !== "ready" || !channelId))
          }
        >
          {" "}
          {saveState === "saving" ? "Saving…" : "Save live notifications"}
        </Button>
        {["failed", "providerUnavailable", "revoked"].includes(
          view.subscriptionStatus
        ) && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => void persist(enabled, false, true)}
          >
            Retry subscription
          </Button>
        )}
      </div>
    </form>
  )
}
