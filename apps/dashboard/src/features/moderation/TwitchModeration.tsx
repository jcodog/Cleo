"use client"
import { useQuery } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { PolicyEditor } from "./PolicyEditor"
import { useUser, useReverification } from "@clerk/nextjs"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { beginTwitchLink } from "../twitch/linking"
import { MODERATION_ROLLOUT_LOCKED } from "@workspace/shared/moderation"
const moderationScopes = [
  "moderator:manage:chat_messages",
  "moderator:manage:warnings",
  "moderator:manage:banned_users",
] as const
export function TwitchModeration() {
  const { user } = useUser()
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const connect = useReverification(async () => {
    if (!user) throw new Error("Sign in before authorising moderation.")
    return beginTwitchLink(user, window.location.origin, [], moderationScopes)
  })
  const linked = useQuery(
    api.queries.dashboard.account.linkedAccounts.listForCurrentUser
  )
  const twitch = linked?.find((account) => account.provider === "twitch")
  if (!twitch)
    return (
      <p>
        Link and sync your Twitch broadcaster account before configuring
        moderation.
      </p>
    )
  return (
    <div className="space-y-6">
      <p className="text-sm">
        Enforcement requires broadcaster consent for deleting chat messages,
        issuing warnings and managing timeouts. Without it, Cleo remains in
        detection mode.
      </p>
      <Button
        variant="outline"
        disabled={MODERATION_ROLLOUT_LOCKED || busy || !user}
        onClick={async () => {
          setBusy(true)
          setNotice("")
          try {
            window.location.assign(await connect())
          } catch {
            setNotice(
              "Twitch moderation consent could not start. Reconnect your broadcaster and try again."
            )
            setBusy(false)
          }
        }}
      >
        Authorise Twitch moderation
      </Button>
      {notice ? <p role="alert">{notice}</p> : null}
      <PolicyEditor platform="twitch" scopeId={twitch.providerAccountId} />
    </div>
  )
}
