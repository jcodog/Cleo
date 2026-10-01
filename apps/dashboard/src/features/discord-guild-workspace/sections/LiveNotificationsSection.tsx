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
import { getLiveNotificationState } from "../lib/liveNotifications"
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
  const { view, error, refresh } = useLiveNotifications(overview.discordGuildId)
  if (error && !view)
    return (
      <div role="alert">
        <p>Live notification settings are unavailable.</p>
        <Button variant="outline" onClick={refresh}>
          Try again
        </Button>
      </div>
    )
  if (!view) return <Skeleton className="h-48 w-full max-w-3xl" />
  return (
    <LiveNotificationsForm
      key={overview.discordGuildId}
      discordGuildId={overview.discordGuildId}
      isBotLeft={isBotLeft || view.botLeft}
      view={view}
      refresh={refresh}
      refreshError={error}
    />
  )
}

function LiveNotificationsForm({
  discordGuildId,
  isBotLeft,
  view,
  refresh,
  refreshError,
}: {
  discordGuildId: string
  isBotLeft: boolean
  view: LiveNotificationsView
  refresh: () => void
  refreshError: boolean
}) {
  const clerk = useClerk()
  const update = useAction(api.liveNotificationActions.update)
  const [optionsRevision, setOptionsRevision] = useState(0)
  const options = useDiscordConfigOptions(discordGuildId, optionsRevision)
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
  const [dirty, setDirty] = useState(false)
  const configRevision = "updatedAt" in view.config ? view.config.updatedAt : 0
  const [remoteRevision, setRemoteRevision] = useState(configRevision)
  if (!dirty && saveState !== "saving" && configRevision > remoteRevision) {
    setEnabled(view.config.liveNotificationsEnabled)
    setChannelId(view.config.liveNotificationChannelId ?? "")
    setMode(view.config.liveNotificationMentionMode)
    setRoleId(view.config.liveNotificationRoleId ?? "")
    setRemoteRevision(configRevision)
  }
  const disabled = isBotLeft || saveState === "saving"
  const sourceReady = view.source.status === "ready"
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
    setDirty(true)
    setSaveState("idle")
    setError(null)
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || (mode === "role" && !roleId)) return
    setSaveState("saving")
    setError(null)
    try {
      const savedRevision = await update({
        discordGuildId,
        liveNotificationsEnabled: enabled,
        liveNotificationChannelId: channelId || undefined,
        liveNotificationMentionMode: mode,
        liveNotificationRoleId:
          mode === "role" ? roleId || undefined : undefined,
      })
      setSaveState("success")
      setRemoteRevision(savedRevision)
      setDirty(false)
      refresh()
    } catch (failure) {
      setSaveState("error")
      setError(getErrorMessage(failure))
    }
  }
  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={save}>
      {refreshError && (
        <p role="alert">
          Connection refresh failed. Your edits are preserved. Try Refresh
          connection again.
        </p>
      )}
      <div className="flex items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="font-heading text-lg font-medium">
            Live notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Let your server know when its owner's Twitch channel goes live.
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
              : view.source.status === "needsLink"
                ? "The Discord server owner must connect Twitch to enable this feature."
                : view.source.status === "missingPermission"
                  ? "The server owner must reconnect Twitch to approve Cleo's required permission."
                  : view.source.status === "stale"
                    ? "The owner's saved Twitch connection is stale. Reconnect and sync it in Cleo."
                    : "Clerk or Twitch cannot verify the owner's connection. Try refreshing later."}
          </p>
        </div>
      </div>
      {view.isOwner && (
        <div className="flex flex-wrap gap-3">
          <Link
            className={buttonVariants({
              variant: sourceReady ? "outline" : "default",
            })}
            href="/twitch"
          >
            {sourceReady
              ? "Manage Twitch connection"
              : "Connect or reconnect Twitch"}
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={() => clerk.openUserProfile()}
          >
            Manage account
          </Button>
        </div>
      )}
      {!view.isOwner && !sourceReady && (
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
          disabled={disabled || (!sourceReady && !enabled)}
          onCheckedChange={(checked) => {
            if (checked && !sourceReady) return
            setEnabled(checked)
            markDirty()
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
          {view.subscriptionStatus === "pending"
            ? "Twitch is confirming the live-event subscription."
            : "The Twitch live-event runtime is unavailable. Notifications will resume after its connection recovers."}
        </p>
      )}
      <SaveStatus state={saveState} errorMessage={error} />
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={
            disabled ||
            (mode === "role" && !roleId) ||
            (enabled &&
              (!sourceReady || options.status !== "ready" || !channelId))
          }
        >
          {" "}
          {saveState === "saving" ? "Saving…" : "Save live notifications"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setOptionsRevision((value) => value + 1)
            refresh()
          }}
        >
          Refresh connection
        </Button>
      </div>
    </form>
  )
}
