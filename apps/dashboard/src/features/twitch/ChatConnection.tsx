"use client"

import { useEffect, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"

const authorizationLabels: Record<string, string> = {
  ready: "Verified",
  unverified: "Verification required",
  needsLink: "Connect Twitch",
  stale: "Reconnect required",
  missingPermission: "Missing chat bot permission",
  identityConflict: "Broadcaster must differ from Cleo's bot",
  unavailable: "Provider unavailable",
  configurationUnavailable: "Service configuration unavailable",
  paused: "Chat presence paused",
}
const chatLabels = {
  ready: "Chat connected",
  connecting: "Connecting",
  disabled: "Disconnected",
  notConnected: "Not connected",
  failed: "Connection failed",
  providerUnavailable: "Provider unavailable",
  revoked: "Authorization revoked. Fresh chatbot authorization is required.",
}

export function ChatConnection() {
  const status = useQuery(api.twitchChat.status, {})
  const retry = useAction(api.twitchChatActions.retry)
  const beginConsent = useAction(api.twitchConsentActions.begin)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!status?.botValidUntil) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, status.botValidUntil - Date.now())
    )
    return () => clearTimeout(timer)
  }, [status?.botValidUntil])
  if (!status) return <p>Loading chatbot status...</p>
  const botReady = status.botReady && status.botValidUntil > now
  async function retryConnection() {
    setBusy(true)
    setResult(null)
    try {
      const outcome = await retry({})
      if (outcome !== "ready")
        setResult(
          authorizationLabels[outcome] ??
            (outcome === "connecting"
              ? "Connecting to Twitch chat."
              : outcome === "activationRequired"
                ? "Chat presence is awaiting service activation."
                : "The chatbot service is unavailable. Try again later.")
        )
    } catch {
      setResult("Cleo could not verify the connection. Try again later.")
    } finally {
      setBusy(false)
    }
  }
  async function authorizeChatbot() {
    setBusy(true)
    setResult(null)
    try {
      window.location.assign(await beginConsent({}))
    } catch {
      setResult(
        "Chatbot authorization could not start. Check the broadcaster connection or try again shortly."
      )
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Chatbot connection"
      className="flex flex-col gap-4 border-t pt-6"
    >
      <h2 className="font-heading text-lg font-medium">Chatbot connection</h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
        <dt className="text-muted-foreground">Broadcaster authorization</dt>
        <dd>
          {authorizationLabels[status.authorization] ?? "Verification required"}
        </dd>
        <dt className="text-muted-foreground">Dedicated Cleo bot</dt>
        <dd>{botReady ? "Ready" : "Readiness unavailable"}</dd>
        <dt className="text-muted-foreground">Chat subscription</dt>
        <dd>{chatLabels[status.chat]}</dd>
        <dt className="text-muted-foreground">Twitch Chat Bots list</dt>
        <dd>
          Visibility has not been independently verified. An active chat
          subscription indicates readiness only.
        </dd>
        <dt className="text-muted-foreground">Last authorization check</dt>
        <dd>
          {status.checkedAt
            ? new Date(status.checkedAt).toLocaleString()
            : "Not yet verified"}
        </dd>
      </dl>
      {!status.activated && (
        <p className="text-sm text-muted-foreground">
          Chat presence is awaiting service activation.
        </p>
      )}
      <div>
        <Button
          variant="outline"
          onClick={retryConnection}
          disabled={busy || status.chat === "revoked"}
        >
          {busy ? "Verifying..." : "Retry chat connection"}
        </Button>
        {status.chat === "revoked" && (
          <div className="mt-3 flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Reconnect Twitch above if needed, then approve chatbot access as
              your linked broadcaster.
            </p>
            <Button
              onClick={authorizeChatbot}
              disabled={
                busy || !status.activated || status.authorization !== "ready"
              }
            >
              {busy ? "Opening Twitch..." : "Authorize chatbot"}
            </Button>
          </div>
        )}
      </div>
      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {result}
        </p>
      )}
    </section>
  )
}
