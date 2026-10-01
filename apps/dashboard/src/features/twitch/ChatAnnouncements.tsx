"use client"
import { useState } from "react"
import { useQuery, useAction } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  announcementKeys,
  eventDefinitions,
  previewTemplate,
  validateTemplate,
  TEMPLATE_LIMIT,
  type AnnouncementKey,
} from "@workspace/shared/twitchEventSub"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import type { FunctionReturnType } from "convex/server"

type Settings = FunctionReturnType<typeof api.twitchEventSub.settings>
export function ChatAnnouncements({
  onReconnect,
}: {
  onReconnect: (key: AnnouncementKey) => void
}) {
  const settings = useQuery(api.twitchEventSub.settings, {})
  if (!settings) return <p>Loading chat announcements…</p>
  return (
    <section
      aria-label="Chat announcements"
      className="flex flex-col gap-6 border-t pt-6"
    >
      <div>
        <h2 className="font-heading text-lg font-medium">Chat announcements</h2>
        <p className="text-sm text-muted-foreground">
          Choose which events Cleo announces in your Twitch chat. Message edits
          save separately from event toggles.
        </p>
      </div>
      {(["Community", "Subscriptions", "Support"] as const).map((group) => (
        <section key={group} aria-label={group} className="flex flex-col gap-4">
          <h3 className="font-heading font-medium">{group}</h3>
          {announcementKeys
            .filter((key) => eventDefinitions[key].group === group)
            .map((key) => (
              <AnnouncementRow
                key={key}
                eventKey={key}
                settings={settings}
                onReconnect={onReconnect}
              />
            ))}
        </section>
      ))}
    </section>
  )
}
export function AnnouncementRow({
  eventKey,
  settings,
  onReconnect,
}: {
  eventKey: AnnouncementKey
  settings: Settings
  onReconnect: (key: AnnouncementKey) => void
}) {
  const definition = eventDefinitions[eventKey]
  const config = settings.configs.find((config) => config.key === eventKey)
  const stored = config?.template ?? definition.defaultTemplate
  const [draft, setDraft] = useState(stored)
  const [baseline, setBaseline] = useState(stored)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = useAction(api.twitchEventSubActions.updateAnnouncement)
  const dirty = draft !== baseline
  if (!dirty && baseline !== stored && !busy) {
    setBaseline(stored)
    setDraft(stored)
  }
  let preview = ""
  let invalid: string | undefined
  try {
    preview = previewTemplate(eventKey, draft)
  } catch (failure) {
    invalid = failure instanceof Error ? failure.message : "Invalid template."
  }
  const status = settings.subscriptions.find(
    (subscription) => subscription.key === eventKey
  )?.status
  const enabled = config?.enabled ?? false
  async function persist(
    nextEnabled: boolean,
    useDraft: boolean,
    retry = false
  ) {
    if (busy || (useDraft && invalid)) return
    setBusy(true)
    setError(null)
    try {
      const source = useDraft ? draft : stored
      await update({
        key: eventKey,
        enabled: nextEnabled,
        template: validateTemplate(eventKey, source) ?? null,
        retry,
      })
      if (useDraft) setBaseline(draft)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Subscription failed."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3 border-b pb-5">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={`${eventKey}-enabled`} className="font-medium">
          {definition.label}
        </label>
        <Switch
          id={`${eventKey}-enabled`}
          checked={enabled}
          disabled={busy || (!enabled && !!invalid)}
          onCheckedChange={(checked) => void persist(checked, checked)}
        />
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {status === "providerUnavailable"
          ? "Provider unavailable"
          : status === "failed"
            ? "Subscription failed"
            : !enabled
              ? "Disabled"
              : status === "ready"
                ? "Ready"
                : status === "connecting"
                  ? "Connecting"
                  : "Subscription failed"}
      </p>
      <label htmlFor={`${eventKey}-message`} className="text-sm font-medium">
        Message{" "}
        <span className="font-normal text-muted-foreground">
          {draft === definition.defaultTemplate
            ? "Using Cleo default"
            : "Custom message"}
        </span>
      </label>
      <Textarea
        id={`${eventKey}-message`}
        value={draft}
        disabled={busy}
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
        }}
        aria-describedby={`${eventKey}-tags ${eventKey}-preview`}
      />
      <p className="text-xs text-muted-foreground">
        {[...draft].length} / {TEMPLATE_LIMIT} characters. Final messages over
        500 characters use the Cleo default.
      </p>
      <div
        id={`${eventKey}-tags`}
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-sm">Available tags:</span>
        {Object.entries(definition.tags).map(([tag, info]) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            key={tag}
            title={info.description}
            disabled={busy}
            onClick={() => setDraft((value) => `${value}{${tag}}`)}
          >{`{${tag}}`}</Button>
        ))}
      </div>
      <div id={`${eventKey}-preview`} className="border-l-2 pl-3 text-sm">
        <p className="text-muted-foreground">Preview with sample data</p>
        <p>{invalid ?? preview}</p>
      </div>
      {(error || invalid) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? invalid}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || !dirty || !!invalid}
          onClick={() => void persist(enabled, true)}
        >
          Save message
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || draft === definition.defaultTemplate}
          onClick={() => setDraft(definition.defaultTemplate)}
        >
          Reset to default
        </Button>
        {error?.includes("Reconnect required") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onReconnect(eventKey)}
          >
            Reconnect Twitch
          </Button>
        )}
        {(status === "failed" ||
          status === "providerUnavailable" ||
          (enabled && status === "revoked")) && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void persist(enabled, false, true)}
          >
            Retry subscription
          </Button>
        )}
      </div>
    </div>
  )
}
