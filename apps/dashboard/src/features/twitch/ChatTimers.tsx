"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  timerConfiguration,
  eligibleTimerGroups,
  type TimerConfiguration,
} from "@workspace/shared/twitchTimers"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"

type TimerView = FunctionReturnType<typeof api.twitchTimers.list>
type Group = TimerView["groups"][number]
const defaults: TimerConfiguration = {
  name: "",
  enabled: true,
  intervalMinutes: 15,
  minimumMessages: 5,
  messages: [""],
}
const states: Record<NonNullable<Group["diagnostic"]>, string> = {
  ready: "Last send confirmed",
  waitingForStream: "Waiting for stream",
  waitingForActivity: "Live, waiting for activity",
  intervalPending: "Interval pending",
  rateLimited: "Rate limited",
  providerUnavailable: "Provider unavailable",
  authorizationRevoked: "Authorization revoked",
  failed: "Last send failed",
  uncertain: "Last attempt uncertain",
}
export function ChatTimers() {
  const view = useQuery(api.twitchTimers.list, {})
  const health = useQuery(api.twitchChat.status, {})
  const [selection, setSelection] = useState<string>()
  const [dirty, setDirty] = useState(false)
  const [savedNotice, setSavedNotice] = useState<string>()
  const [capacityTime, setCapacityTime] = useState(() => Date.now())
  useEffect(() => {
    if (
      !view?.entitlement.expiresAt ||
      view.entitlement.expiresAt <= capacityTime
    )
      return
    const timer = setTimeout(
      () => setCapacityTime(Date.now()),
      Math.min(
        2_147_000_000,
        Math.max(0, view.entitlement.expiresAt - Date.now())
      )
    )
    return () => clearTimeout(timer)
  }, [view?.entitlement.expiresAt, capacityTime])
  function select(id?: string) {
    if (dirty && !window.confirm("Discard unsaved timer changes?")) return
    setDirty(false)
    setSavedNotice(undefined)
    setSelection(id)
  }
  if (!view) return <Skeleton className="h-48 w-full" />
  const expired =
    view.entitlement.expiresAt !== null &&
    view.entitlement.expiresAt <= capacityTime
  const limit = expired ? 1 : view.entitlement.limit
  const eligibleIds = new Set(
    eligibleTimerGroups(view.groups, limit).map((group) => group.id)
  )
  const groups = view.groups.map((group) => ({
    ...group,
    locked: group.locked || !eligibleIds.has(group.id),
  }))
  const selected = groups.find((g) => g.id === selection)
  const editing = selection === "new" || !!selected
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <p>
            {view.groups.length} / {limit} timer groups
          </p>
          <p className="text-muted-foreground">
            {view.entitlement.source === "testGrant" && !expired
              ? `Test access, expires ${new Date(view.entitlement.expiresAt!).toLocaleString()}. This is not a paid subscription.`
              : "Free access includes one group. Paid broadcaster billing is not available yet."}
          </p>
        </div>
        <Button
          onClick={() => select("new")}
          disabled={!view.connected || view.groups.length >= limit}
        >
          <IconPlus data-icon="inline-start" />
          New group
        </Button>
      </div>
      {!view.connected && (
        <p className="text-sm">
          Connect your broadcaster in the{" "}
          <Link href="/twitch" className="text-primary underline">
            Twitch overview
          </Link>{" "}
          to create timers.
        </p>
      )}
      <div className="grid min-w-0 gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav
          aria-label="Timer groups"
          className={cn(
            "min-w-0 md:border-r md:pr-5",
            editing && "hidden md:block"
          )}
        >
          {view.groups.length ? (
            <ol className="flex flex-col divide-y">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    aria-current={selection === group.id ? "true" : undefined}
                    onClick={() => select(group.id)}
                    className="flex w-full flex-col gap-1 py-4 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring aria-current:text-primary"
                  >
                    <span className="font-medium break-words">
                      {group.name}
                    </span>
                    <span className="text-muted-foreground">
                      {group.locked
                        ? "Locked"
                        : group.enabled
                          ? "Enabled"
                          : "Disabled"}{" "}
                      · Every {group.intervalMinutes} min
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.messages.length} messages · {group.minimumMessages}{" "}
                      chat messages required
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              No timer groups yet. Create a group and add its first message.
            </p>
          )}
        </nav>
        {editing ? (
          <div className="min-w-0">
            <Button
              variant="ghost"
              className="mb-4 md:hidden"
              onClick={() => select(undefined)}
            >
              Back to groups
            </Button>
            <TimerEditor
              key={selection}
              group={selected}
              health={health}
              initialFeedback={savedNotice}
              onDirty={setDirty}
              onSaved={(id) => {
                setDirty(false)
                setSavedNotice("Group saved.")
                setSelection(id)
              }}
              onDeleted={() => {
                setDirty(false)
                setSelection(undefined)
              }}
            />
          </div>
        ) : (
          <p className="hidden py-4 text-sm text-muted-foreground md:block">
            Select a group to configure its schedule and messages.
          </p>
        )}
      </div>
    </div>
  )
}

export function TimerEditor({
  group,
  health,
  onDirty,
  onSaved,
  onDeleted,
  initialFeedback,
}: {
  group?: Group
  health?: FunctionReturnType<typeof api.twitchChat.status>
  onDirty: (dirty: boolean) => void
  onSaved: (id: string) => void
  onDeleted: () => void
  initialFeedback?: string
}) {
  const prefix = useId()
  const initial = group ? timerConfiguration.parse(group) : defaults
  const [draft, setDraft] = useState<TimerConfiguration>(initial)
  const [baseline, setBaseline] = useState(JSON.stringify(initial))
  const [revision, setRevision] = useState(group?.revision)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | undefined>(initialFeedback)
  const [now, setNow] = useState(() => Date.now())
  const save = useMutation(api.twitchTimers.save)
  const remove = useMutation(api.twitchTimers.remove)
  const dirty = JSON.stringify(draft) !== baseline
  const validation = timerConfiguration.safeParse(draft)
  const errors = validation.success ? [] : validation.error.issues
  const locked = group?.locked ?? false
  const changed = group && group.revision !== revision
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  useEffect(() => {
    const deadlines = [
      health?.botValidUntil,
      group?.diagnosticAt === undefined
        ? undefined
        : group.diagnosticAt + 90_000,
    ].filter(
      (deadline): deadline is number => deadline !== undefined && deadline > now
    )
    if (!deadlines.length) return
    const expires = Math.min(...deadlines)
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(2_147_000_000, Math.max(0, expires - Date.now()))
    )
    return () => clearTimeout(timer)
  }, [health?.botValidUntil, group?.diagnosticAt, now])
  function patch(value: Partial<TimerConfiguration>) {
    setDraft((current) => ({ ...current, ...value }))
    setFeedback(undefined)
  }
  function move(index: number, offset: number) {
    const messages = [...draft.messages]
    const other = index + offset
    if (other < 0 || other >= messages.length) return
    ;[messages[index], messages[other]] = [messages[other]!, messages[index]!]
    patch({ messages })
  }
  async function persist() {
    if (!validation.success || busy || group?.broadcasterChanged) return
    setBusy(true)
    setFeedback(undefined)
    try {
      const id = await save({
        ...validation.data,
        ...(group ? { id: group.id, revision } : {}),
      })
      setBaseline(JSON.stringify(draft))
      setRevision((revision ?? 0) + 1)
      setFeedback("Group saved.")
      onSaved(id)
    } catch {
      setFeedback(
        "Could not save this group. Check your access and reload if it changed elsewhere."
      )
    } finally {
      setBusy(false)
    }
  }
  const diagnostic =
    group?.diagnostic === "uncertain" ||
    (group?.diagnosticAt !== undefined && group.diagnosticAt + 90_000 > now)
      ? group?.diagnostic
      : undefined
  const runtime = !group?.enabled
    ? "Disabled"
    : locked
      ? "Premium required"
      : !health || !health.botReady || health.botValidUntil <= now
        ? "Worker unavailable"
        : health.authorization !== "ready"
          ? "Needs authorization"
          : health.chat === "revoked"
            ? "Chat subscription revoked"
            : health.chat !== "ready"
              ? "Chat not connected"
              : group.sessionLive !== true &&
                  diagnostic !== "providerUnavailable"
                ? "Waiting for stream"
                : diagnostic
                  ? states[diagnostic]
                  : "Live, waiting for worker verification"
  return (
    <form
      className="flex min-w-0 flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void persist()
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-medium">
          {group ? group.name : "New timer group"}
        </h2>
        <div role="status" className="text-sm text-muted-foreground">
          {dirty ? "Unsaved changes" : "Saved configuration"}
        </div>
      </div>
      {locked && (
        <p className="text-sm text-muted-foreground">
          {group?.broadcasterChanged
            ? "This group belongs to a previously linked broadcaster. Its messages are preserved. Delete it to free capacity for your current channel."
            : "Your group limit is one. This group's messages and saved enablement are preserved. It cannot send until access is restored or an earlier group is deleted."}
        </p>
      )}
      {changed && (
        <p role="alert" className="text-sm text-destructive">
          This group changed elsewhere. Reload its configuration before saving.
        </p>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${prefix}-name`}>Group name</FieldLabel>
          <Input
            id={`${prefix}-name`}
            maxLength={80}
            value={draft.name}
            disabled={busy || !!group?.broadcasterChanged}
            onChange={(event) => patch({ name: event.target.value })}
            aria-invalid={errors.some((error) => error.path[0] === "name")}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor={`${prefix}-enabled`}>Enable group</FieldLabel>
          <Switch
            id={`${prefix}-enabled`}
            checked={draft.enabled}
            disabled={busy || (locked && !group?.enabled)}
            onCheckedChange={(enabled) => patch({ enabled })}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${prefix}-interval`}>
              Interval in minutes
            </FieldLabel>
            <Input
              id={`${prefix}-interval`}
              type="number"
              min={5}
              max={120}
              value={draft.intervalMinutes}
              disabled={busy}
              onChange={(event) =>
                patch({ intervalMinutes: Number(event.target.value) })
              }
              aria-invalid={errors.some(
                (error) => error.path[0] === "intervalMinutes"
              )}
            />
            <FieldDescription>
              5 to 120 minutes, shared by all messages.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-minimum`}>
              Minimum chat messages
            </FieldLabel>
            <Input
              id={`${prefix}-minimum`}
              type="number"
              min={1}
              max={100}
              value={draft.minimumMessages}
              disabled={busy}
              onChange={(event) =>
                patch({ minimumMessages: Number(event.target.value) })
              }
              aria-invalid={errors.some(
                (error) => error.path[0] === "minimumMessages"
              )}
            />
            <FieldDescription>
              1 to 100 messages, with activity in the last 5 minutes.
            </FieldDescription>
          </Field>
        </div>
      </FieldGroup>
      <section
        aria-label="Rotating messages"
        className="flex flex-col gap-4 border-t pt-5"
      >
        <h3 className="font-medium">Messages</h3>
        <ol className="flex flex-col gap-5">
          {draft.messages.map((message, index) => (
            <li key={index} className="flex min-w-0 flex-col gap-2">
              <Field
                data-invalid={errors.some(
                  (error) =>
                    error.path[0] === "messages" && error.path[1] === index
                )}
              >
                <FieldLabel htmlFor={`${prefix}-message-${index}`}>
                  Message {index + 1}
                  {group &&
                  !dirty &&
                  index === group.cursor % draft.messages.length
                    ? " · Next in rotation"
                    : ""}
                </FieldLabel>
                <Textarea
                  id={`${prefix}-message-${index}`}
                  className="min-h-28"
                  value={message}
                  disabled={busy}
                  aria-invalid={errors.some(
                    (error) =>
                      error.path[0] === "messages" && error.path[1] === index
                  )}
                  onChange={(event) =>
                    patch({
                      messages: draft.messages.map((value, i) =>
                        i === index ? event.target.value : value
                      ),
                    })
                  }
                />
                <FieldDescription>
                  {[...message].length} / 500 characters
                </FieldDescription>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Move message ${index + 1} up`}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <IconArrowUp data-icon="inline-start" />
                  Move up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Move message ${index + 1} down`}
                  disabled={busy || index === draft.messages.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <IconArrowDown data-icon="inline-start" />
                  Move down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove message ${index + 1}`}
                  disabled={busy || draft.messages.length === 1}
                  onClick={() =>
                    patch({
                      messages: draft.messages.filter((_, i) => i !== index),
                    })
                  }
                >
                  <IconTrash data-icon="inline-start" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy || draft.messages.length >= 20}
          onClick={() => patch({ messages: [...draft.messages, ""] })}
        >
          <IconPlus data-icon="inline-start" />
          Add message
        </Button>
      </section>
      {errors.length > 0 && dirty && (
        <p role="alert" className="text-sm text-destructive">
          Use a group name, an interval of 5-120 minutes, a chat threshold of
          1-100, and 1-20 nonempty messages of up to 500 characters without line
          breaks or control characters. Messages cannot start with "/" or ".".
        </p>
      )}
      <div className="flex flex-wrap gap-3 border-t pt-5">
        <Button
          type="submit"
          disabled={
            busy ||
            !dirty ||
            !validation.success ||
            !!changed ||
            (locked && draft.enabled && !group?.enabled) ||
            !!group?.broadcasterChanged
          }
        >
          {busy ? "Saving..." : "Save group"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || (!dirty && !changed)}
          onClick={() => {
            const value = group ? timerConfiguration.parse(group) : defaults
            setDraft(value)
            setBaseline(JSON.stringify(value))
            setRevision(group?.revision)
            setFeedback(undefined)
          }}
        >
          {changed ? "Reload configuration" : "Discard changes"}
        </Button>
        {group && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Delete ${group.name} and all its messages?`))
                return
              setBusy(true)
              try {
                await remove({ id: group.id })
                onDeleted()
              } catch {
                setFeedback("Could not delete this group.")
              } finally {
                setBusy(false)
              }
            }}
          >
            Delete group
          </Button>
        )}
      </div>
      {feedback && (
        <p role="status" className="text-sm">
          {feedback}
        </p>
      )}
      {group && (
        <details className="border-t pt-4 text-sm">
          <summary className="cursor-pointer">
            Runtime details: {runtime}
          </summary>
          <dl className="mt-4 grid gap-2 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Last confirmed send</dt>
            <dd>
              {group.lastSentAt
                ? new Date(group.lastSentAt).toLocaleString()
                : "No confirmed send"}
            </dd>
            <dt className="text-muted-foreground">Last attempt</dt>
            <dd>
              {group.lastAttemptAt
                ? new Date(group.lastAttemptAt).toLocaleString()
                : "No attempt yet"}
            </dd>
            <dt className="text-muted-foreground">Last worker check</dt>
            <dd>
              {group.diagnosticAt
                ? new Date(group.diagnosticAt).toLocaleString()
                : "Not yet checked"}
            </dd>
          </dl>
          <p className="mt-3 text-muted-foreground">
            Changes normally reach the worker within 15 seconds. Timers wait for
            a live stream and fresh chat activity. Missed intervals are skipped.
          </p>
        </details>
      )}
    </form>
  )
}
