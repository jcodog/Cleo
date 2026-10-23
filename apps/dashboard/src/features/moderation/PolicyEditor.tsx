"use client"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  compileModerationPolicy,
  evaluateModeration,
  MODERATION_RULE_ORDER,
  MODERATION_ROLLOUT_LOCKED,
  type ModerationPolicy,
} from "@workspace/shared/moderation"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"

const labels = {
  links: "External links",
  discordInvites: "Discord invites",
  uppercase: "Uppercase",
  emojiSpam: "Emoji and emotes",
  symbolSpam: "Symbols",
  repeatedCharacters: "Repeated characters",
  duplicateMessages: "Duplicate messages",
  flooding: "Chat flooding",
  repeatedPhrases: "Repeated phrases",
  blockedWords: "Blocked words and phrases",
}
export function PolicyEditor({
  platform,
  scopeId,
}: {
  platform: "discord" | "twitch"
  scopeId: string
}) {
  const [reload, setReload] = useState(0)
  const view = useQuery(api.moderationPolicies.get, { platform, scopeId })
  if (!view) return <p>Loading moderation policy…</p>
  return (
    <PolicyForm
      key={`${platform}:${scopeId}:${reload}`}
      platform={platform}
      scopeId={scopeId}
      initial={view}
      onReload={() => setReload((value) => value + 1)}
    />
  )
}
function PolicyForm({
  platform,
  scopeId,
  initial,
  onReload,
}: {
  platform: "discord" | "twitch"
  scopeId: string
  initial: {
    policyJSON: string
    revision: number
    enforcement: boolean
    health: string
  }
  onReload: () => void
}) {
  const save = useMutation(api.moderationPolicies.save)
  const [policy, setPolicy] = useState(
    () => compileModerationPolicy(JSON.parse(initial.policyJSON)).policy
  )
  const [enforcement, setEnforcement] = useState(initial.enforcement)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [testText, setTestText] = useState("")
  const [preview, setPreview] = useState("")
  const [revision, setRevision] = useState(initial.revision)
  const conflict = initial.revision !== revision
  function updateRule(
    id: keyof ModerationPolicy["rules"],
    key: string,
    value: unknown
  ) {
    try {
      setPolicy(
        compileModerationPolicy({
          ...policy,
          rules: {
            ...policy.rules,
            [id]: { ...policy.rules[id], [key]: value },
          },
        }).policy
      )
      setError("")
    } catch {
      setError("Invalid setting. Check limits and duplicate blocked entries.")
    }
  }
  async function submit() {
    setSaving(true)
    setError("")
    try {
      setRevision(
        await save({
          platform,
          scopeId,
          policyJSON: JSON.stringify(policy),
          expectedRevision: revision,
          enforcement,
        })
      )
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Policy could not be saved."
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <section
      className="space-y-6"
      aria-label={`${platform} message protection`}
    >
      <p role="status">
        Moderation is unavailable in this release. These controls are locked and
        cannot activate message processing or enforcement.
      </p>
      <fieldset disabled={MODERATION_ROLLOUT_LOCKED} className="space-y-6">
        <header>
          <h2 className="font-heading text-lg font-medium">
            Message protection
          </h2>
          <p className="text-sm text-muted-foreground">
            All filters start disabled. Preview messages stay in your browser.
          </p>
        </header>
        <p role="status" className="text-sm">
          Connection health: {initial.health}. Discord needs approved Message
          Content access. Twitch actions need broadcaster moderation consent.
          Runtime enforcement must also be enabled by the operator.
        </p>
        {conflict ? (
          <div role="alert">
            <p>
              Another configuration revision is available. Reload before saving
              your changes.
            </p>
            <Button variant="outline" onClick={onReload}>
              Discard edits and load current policy
            </Button>
          </div>
        ) : null}
        <div className="divide-y">
          {MODERATION_RULE_ORDER.map((id) => (
            <div key={id} className="space-y-3 py-4">
              <Field orientation="horizontal">
                <Switch
                  aria-label={labels[id]}
                  checked={policy.rules[id].enabled}
                  onCheckedChange={(enabled) =>
                    updateRule(id, "enabled", enabled)
                  }
                />
                <FieldLabel>{labels[id]}</FieldLabel>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-severity`}>Severity</FieldLabel>
                <select
                  id={`${id}-severity`}
                  className="rounded-md border bg-background p-2 text-sm"
                  value={policy.rules[id].severity}
                  onChange={(e) => updateRule(id, "severity", e.target.value)}
                >
                  {["low", "medium", "high"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <details>
                <summary>Exemptions for {labels[id].toLowerCase()}</summary>
                {(["moderators", "administrators"] as const).map((key) => (
                  <Field orientation="horizontal" key={key}>
                    <Switch
                      aria-label={`${labels[id]} exempt ${key}`}
                      checked={policy.rules[id].exemptions[key]}
                      onCheckedChange={(value) =>
                        updateRule(id, "exemptions", {
                          ...policy.rules[id].exemptions,
                          [key]: value,
                        })
                      }
                    />
                    <FieldLabel>Exempt {key}</FieldLabel>
                  </Field>
                ))}
                {(["userIds", "roleIds"] as const).map((key) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`${id}-${key}`}>
                      Exempt {key === "userIds" ? "user" : "role"} IDs, one per
                      line
                    </FieldLabel>
                    <Textarea
                      id={`${id}-${key}`}
                      defaultValue={policy.rules[id].exemptions[key].join("\n")}
                      onBlur={(e) =>
                        updateRule(id, "exemptions", {
                          ...policy.rules[id].exemptions,
                          [key]: e.target.value
                            .split("\n")
                            .map((v) => v.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                ))}
              </details>
              {Object.entries(policy.rules[id])
                .filter(
                  ([key, value]) =>
                    typeof value === "number" && key !== "revision"
                )
                .map(([key, value]) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`${id}-${key}`}>
                      {key.replace(/([A-Z])/g, " $1")}
                    </FieldLabel>
                    <Input
                      id={`${id}-${key}`}
                      type="number"
                      value={String(value)}
                      onChange={(event) =>
                        updateRule(id, key, Number(event.target.value))
                      }
                    />
                  </Field>
                ))}
              <Field>
                <FieldLabel htmlFor={`${id}-action`}>
                  Proposed action
                </FieldLabel>
                <select
                  id={`${id}-action`}
                  className="rounded-md border bg-background p-2 text-sm"
                  value={policy.rules[id].action.kind}
                  onChange={(event) =>
                    updateRule(
                      id,
                      "action",
                      event.target.value === "timeout"
                        ? { kind: "timeout", durationSeconds: 60 }
                        : { kind: event.target.value }
                    )
                  }
                >
                  {["log", "warn", "delete", "timeout"].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </Field>
              {policy.rules[id].action.kind === "timeout" ? (
                <Field>
                  <FieldLabel htmlFor={`${id}-duration`}>
                    Timeout seconds
                  </FieldLabel>
                  <Input
                    id={`${id}-duration`}
                    type="number"
                    value={policy.rules[id].action.durationSeconds}
                    onChange={(e) =>
                      updateRule(id, "action", {
                        kind: "timeout",
                        durationSeconds: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              ) : null}
            </div>
          ))}
        </div>
        <Field>
          <FieldLabel htmlFor="allowed-domains">
            Allowed domains, one per line
          </FieldLabel>
          <Textarea
            id="allowed-domains"
            defaultValue={policy.rules.links.allowedDomains.join("\n")}
            onBlur={(e) =>
              updateRule(
                "links",
                "allowedDomains",
                e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean)
              )
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="blocked-terms">
            Blocked literal words or phrases, one per line, up to 50
          </FieldLabel>
          <FieldDescription>
            Whole-word matching is enabled. Advanced per-entry settings are
            available below.
          </FieldDescription>
          <Textarea
            id="blocked-terms"
            defaultValue={policy.rules.blockedWords.entries
              .map((e) => e.term)
              .join("\n")}
            onBlur={(e) =>
              updateRule(
                "blockedWords",
                "entries",
                e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean)
                  .map((term) => ({
                    term,
                    wholeWord:
                      policy.rules.blockedWords.entries.find(
                        (entry) => entry.term === term
                      )?.wholeWord ?? true,
                  }))
              )
            }
          />
        </Field>
        <Field orientation="horizontal">
          <Switch
            aria-label="Allow subdomains of allowed domains"
            checked={policy.rules.links.allowSubdomains}
            onCheckedChange={(value) =>
              updateRule("links", "allowSubdomains", value)
            }
          />
          <FieldLabel>Allow subdomains of allowed domains</FieldLabel>
        </Field>
        {policy.rules.blockedWords.entries.map((entry, index) => (
          <Field orientation="horizontal" key={entry.term}>
            <Switch
              aria-label={`Whole-word matching for ${entry.term}`}
              checked={entry.wholeWord}
              onCheckedChange={(value) =>
                updateRule(
                  "blockedWords",
                  "entries",
                  policy.rules.blockedWords.entries.map((word, i) =>
                    i === index ? { ...word, wholeWord: value } : word
                  )
                )
              }
            />
            <FieldLabel>Whole-word matching: {entry.term}</FieldLabel>
          </Field>
        ))}
        <details>
          <summary className="cursor-pointer text-sm">
            Exemptions across all rules
          </summary>
          <p className="my-2 text-sm text-muted-foreground">
            Global and per-rule exemptions both apply. Twitch role IDs refer to
            badge set IDs.
          </p>
          {(["moderators", "administrators"] as const).map((key) => (
            <Field key={key} orientation="horizontal">
              <Switch
                aria-label={`Globally exempt ${key}`}
                checked={policy.exemptions[key]}
                onCheckedChange={(value) =>
                  setPolicy(
                    compileModerationPolicy({
                      ...policy,
                      exemptions: { ...policy.exemptions, [key]: value },
                    }).policy
                  )
                }
              />
              <FieldLabel>Exempt {key}</FieldLabel>
            </Field>
          ))}
          {(["userIds", "roleIds"] as const).map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`global-${key}`}>
                Exempt {key === "userIds" ? "user" : "role"} IDs, one per line
              </FieldLabel>
              <Textarea
                id={`global-${key}`}
                defaultValue={policy.exemptions[key].join("\n")}
                onBlur={(e) => {
                  try {
                    setPolicy(
                      compileModerationPolicy({
                        ...policy,
                        exemptions: {
                          ...policy.exemptions,
                          [key]: e.target.value
                            .split("\n")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        },
                      }).policy
                    )
                    setError("")
                  } catch {
                    setError("Check the exemption ID limits.")
                  }
                }}
              />
            </Field>
          ))}
        </details>
        <Field orientation="horizontal">
          <Switch
            checked={enforcement}
            onCheckedChange={setEnforcement}
            aria-label="Request enforcement"
          />
          <FieldLabel>Request authorised enforcement</FieldLabel>
        </Field>
        <p className="text-sm text-muted-foreground">
          When off, matching messages are detected only. When on, platform
          permissions and the operator gate still control whether actions can
          run.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button disabled={saving || !!error || conflict} onClick={submit}>
          {saving ? "Saving…" : "Save message protection"}
        </Button>
        <Field>
          <FieldLabel htmlFor="test-message">Test message</FieldLabel>
          <Textarea
            id="test-message"
            maxLength={8192}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => {
              try {
                const decision = evaluateModeration({
                  message: {
                    id: "preview",
                    authorId: "preview-user",
                    scopeId,
                    content: testText,
                  },
                  policy: compileModerationPolicy(policy),
                  history: [],
                  now: 0,
                })
                setPreview(JSON.stringify(decision, null, 2))
              } catch {
                setPreview("This message could not be evaluated.")
              }
            }}
          >
            Evaluate locally
          </Button>
          <pre
            className="overflow-auto text-xs whitespace-pre-wrap"
            aria-live="polite"
          >
            {preview}
          </pre>
        </Field>
      </fieldset>
    </section>
  )
}
