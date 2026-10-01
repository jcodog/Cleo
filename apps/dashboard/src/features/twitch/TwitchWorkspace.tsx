"use client"

import { useClerk, useReverification, useUser } from "@clerk/nextjs"
import { IconBrandTwitch } from "@tabler/icons-react"
import { useAction, useQuery } from "convex/react"
import { useState } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { ChatAnnouncements } from "./ChatAnnouncements"
import {
  type EventKey,
  type AnnouncementKey,
} from "@workspace/shared/twitchEventSub"

import {
  beginTwitchLink,
  getTwitchLinkState,
  isTwitchProvider,
} from "./linking"

const labels = {
  notConnected: "Not connected",
  connected: "Connected",
  missingPermission: "Missing required permission",
  reconnectRequired: "Reconnect required",
}

export function TwitchWorkspace() {
  const clerk = useClerk()
  const { user, isLoaded } = useUser()
  const connection = useQuery(api.queries.dashboard.twitch.connection.get)
  const sync = useAction(api.actions.dashboard.account.syncLinkedAccounts.sync)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [desiredScopes, setDesiredScopes] = useState<AnnouncementKey[]>([])
  const connect = useReverification(async (keys: readonly EventKey[] = []) => {
    if (!user) throw new Error("Sign in before linking Twitch.")
    return beginTwitchLink(user, window.location.origin, keys)
  })

  if (!isLoaded || connection === undefined)
    return <Skeleton className="h-32 w-full" />
  if (!user) return <p>Sign in to connect Twitch.</p>
  const state = getTwitchLinkState(user.externalAccounts)
  const liveAccount = user.externalAccounts.find((account) =>
    isTwitchProvider(account.provider)
  )
  const matchingConnection =
    liveAccount?.providerUserId === connection?.providerAccountId
      ? connection
      : null
  const synced =
    state === "connected" && !!matchingConnection?.hasBootstrapPermission
  async function link(keys: readonly EventKey[] = []) {
    setBusy(true)
    setError(null)
    try {
      window.location.assign(
        await connect([...new Set([...desiredScopes, ...keys])])
      )
    } catch {
      setError(
        "Twitch connection could not start. Try again, or check whether Twitch is enabled for this account."
      )
      setBusy(false)
    }
  }
  async function synchronize() {
    setBusy(true)
    setError(null)
    try {
      await user?.reload()
      const result = await sync({})
      if (result.status !== "ready")
        setError("The account provider is unavailable. Try syncing again.")
    } catch {
      setError("Cleo could not verify the connection. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Twitch connection" className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Provider unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage
              src={
                state !== "notConnected"
                  ? matchingConnection?.avatarUrl
                  : undefined
              }
              alt="Twitch avatar"
            />
            <AvatarFallback>
              <IconBrandTwitch aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-medium">
              {state !== "notConnected"
                ? (matchingConnection?.displayName ??
                  matchingConnection?.username ??
                  "Twitch account")
                : "Connect your Twitch channel"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Link your broadcaster account to give Cleo permission to join your
              chat.
            </p>
          </div>
        </div>
        <Badge variant={synced ? "secondary" : "outline"}>
          {busy
            ? "Connecting"
            : state === "connected" && !synced
              ? "Sync required"
              : labels[state]}
        </Badge>
      </div>
      <div className="flex flex-col items-start gap-3">
        {state === "missingPermission" && (
          <p className="text-sm text-muted-foreground">
            Reconnect to approve Cleo's chat bot permission.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => clerk.openUserProfile()}
            disabled={busy}
          >
            Manage account
          </Button>
          <Button onClick={() => link()} disabled={busy}>
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconBrandTwitch data-icon="inline-start" />
            )}
            {state === "notConnected" ? "Connect Twitch" : "Reconnect Twitch"}
          </Button>
          {state !== "notConnected" && (
            <Button variant="outline" onClick={synchronize} disabled={busy}>
              Sync connection
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Manage account opens your Clerk profile. Use Connect or Reconnect here
          to grant Cleo's Twitch permission, then sync the connection.
        </p>
        <p className="text-sm text-muted-foreground">
          Your Discord sign-in stays the same. Cleo's dedicated bot account
          handles chat messages.
        </p>
      </div>
      {synced && (
        <ChatAnnouncements
          approvedScopes={liveAccount?.approvedScopes
            .split(/\s+/)
            .filter(Boolean)}
          onPermissionRequired={(key) =>
            setDesiredScopes((current) => [...new Set([...current, key])])
          }
          onReconnect={(key) => void link([key])}
        />
      )}
    </section>
  )
}
