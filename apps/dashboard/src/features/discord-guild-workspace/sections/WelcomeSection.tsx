"use client"

import { useState, type FormEvent } from "react"
import {
  IconAlignCenter,
  IconAlignLeft,
  IconCheck,
  IconLock,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { useMutation } from "convex/react"
import {
  FREE_WELCOME_STYLE,
  WELCOME_PALETTES,
  WELCOME_PRESETS,
  isFreeWelcomeStyle,
  parseWelcomeCardStyle,
  type WelcomeCardStyle,
} from "@workspace/shared/welcomeCard"
import {
  DiscordChannelSelect,
  useDiscordConfigOptions,
} from "../components/ConfigSelectors"
import { WelcomeCardPreview } from "../components/WelcomeCardPreview"
import { SaveStatus } from "../components/workspace-ui"
import { toOptionalChannelValue, toOptionalTextValue } from "../lib/config"
import { getErrorMessage } from "../lib/format"
import type { GuildOverview, SaveState } from "../types"

const presetDescriptions = {
  classic: "The familiar Cleo welcome.",
  aurora: "Soft light. A little atmosphere.",
  spotlight: "Put your newest member centre stage.",
  ribbon: "A bold accent with a clean edge.",
}
const palettes = ["cyan", "orchid", "forest", "amber"] as const

export function WelcomeSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateWorkspaceSection = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection.update
  )
  const optionsState = useDiscordConfigOptions(overview.discordGuildId)
  const [enabled, setEnabled] = useState(
    overview.guildConfig?.welcomeEnabled ?? false
  )
  const [channelId, setChannelId] = useState(
    overview.guildConfig?.welcomeChannelId ?? ""
  )
  const [subtext, setSubtext] = useState(
    overview.guildConfig?.welcomeSubtext ?? ""
  )
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [style, setStyle] = useState<WelcomeCardStyle>(FREE_WELCOME_STYLE)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const premiumPreview = !isFreeWelcomeStyle(style)
  const disabled = isBotLeft || saveState === "saving"
  let styleError: string | undefined
  try {
    parseWelcomeCardStyle(style)
  } catch {
    styleError =
      "Enter 1 to 120 characters. Use only {member} and {server} placeholders."
  }
  function markDirty() {
    setSaveState("idle")
    setErrorMessage(null)
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    setSaveState("saving")
    setErrorMessage(null)
    try {
      await updateWorkspaceSection({
        discordGuildId: overview.discordGuildId,
        modules: { welcomeEnabled: enabled },
        channels: { welcomeChannelId: toOptionalChannelValue(channelId) },
        welcome: {
          subtext: toOptionalTextValue(subtext),
          style: FREE_WELCOME_STYLE,
        },
      })
      setSaveState("success")
    } catch (error) {
      setSaveState("error")
      setErrorMessage(getErrorMessage(error))
    }
  }
  return (
    <form className="max-w-6xl space-y-8" onSubmit={handleSubmit}>
      {overview.welcomeCardStudioAvailable && (
        <>
          <header className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              A welcome worth remembering
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Make the first hello feel like your community. Explore Cleo
              Premium designs, or keep the familiar Classic card.
            </p>
          </header>
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              <fieldset disabled={disabled}>
                <legend className="mb-3 text-sm font-semibold">
                  Choose a design
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {WELCOME_PRESETS.map((preset) => (
                    <label
                      key={preset.id}
                      className="group relative min-w-0 cursor-pointer rounded-xl border border-border/70 p-2 transition-colors hover:border-primary/50 has-checked:border-cyan-400/70 has-checked:bg-primary/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-primary"
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="welcome-preset"
                        value={preset.id}
                        aria-label={preset.name}
                        checked={style.preset === preset.id}
                        onChange={() =>
                          setStyle(
                            preset.premium
                              ? {
                                  ...style,
                                  preset: preset.id,
                                  align:
                                    preset.id === "spotlight"
                                      ? "center"
                                      : "left",
                                }
                              : FREE_WELCOME_STYLE
                          )
                        }
                      />
                      <WelcomeCardPreview
                        compact
                        style={{
                          ...FREE_WELCOME_STYLE,
                          preset: preset.id,
                          align: preset.id === "spotlight" ? "center" : "left",
                        }}
                        subtext="Your next chapter starts here."
                        server={overview.name}
                      />
                      <div className="space-y-1 px-1 pt-3 pb-2">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-medium">
                            {preset.name}
                          </span>
                          {style.preset === preset.id && (
                            <IconCheck
                              aria-hidden="true"
                              className="size-4 shrink-0 text-cyan-300"
                            />
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {presetDescriptions[preset.id]}
                        </p>
                        <span
                          className={
                            preset.premium
                              ? "text-[10px] font-medium tracking-wide text-cyan-300"
                              : "text-[10px] font-medium tracking-wide text-muted-foreground"
                          }
                        >
                          {preset.premium ? "PREMIUM PREVIEW" : "FREE"}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={disabled}>
                <legend className="mb-3 text-sm font-semibold">
                  Set the mood
                </legend>
                <div className="grid grid-cols-4 gap-2">
                  {palettes.map((palette) => (
                    <label
                      key={palette}
                      className="cursor-pointer rounded-lg border border-border/70 px-2 py-3 text-center transition-colors hover:border-primary/50 has-checked:border-cyan-400/70 has-checked:bg-primary/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-primary"
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="welcome-palette"
                        value={palette}
                        aria-label={`${palette[0]?.toUpperCase()}${palette.slice(1)} palette`}
                        checked={style.palette === palette}
                        onChange={() => setStyle({ ...style, palette })}
                      />
                      <span
                        aria-hidden="true"
                        className="mx-auto mb-2 flex size-7 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: WELCOME_PALETTES[palette].accent,
                        }}
                      >
                        {style.palette === palette && (
                          <IconCheck className="size-4 text-neutral-950" />
                        )}
                      </span>
                      <span className="text-xs capitalize">{palette}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-4" disabled={disabled}>
                <legend className="mb-3 text-sm font-semibold">
                  Make it personal
                </legend>
                <Field>
                  <FieldLabel htmlFor="welcome-greeting">Greeting</FieldLabel>
                  <Input
                    id="welcome-greeting"
                    aria-invalid={styleError !== undefined}
                    aria-describedby="welcome-greeting-help"
                    maxLength={120}
                    value={style.greeting}
                    onChange={(event) =>
                      setStyle({ ...style, greeting: event.target.value })
                    }
                  />
                  <FieldDescription
                    id="welcome-greeting-help"
                    className={styleError ? "text-amber-400" : ""}
                  >
                    {styleError ?? (
                      <>
                        Use{" "}
                        <code className="text-foreground">{"{member}"}</code>{" "}
                        for their name and{" "}
                        <code className="text-foreground">{"{server}"}</code>{" "}
                        for your community. Emoji and Discord custom emoji are
                        welcome.
                      </>
                    )}
                  </FieldDescription>
                </Field>
                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">
                    Text alignment
                  </legend>
                  <div className="inline-flex gap-1 rounded-lg border p-1">
                    {(["left", "center"] as const).map((align) => (
                      <label
                        key={align}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground has-checked:bg-muted has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-primary"
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="welcome-alignment"
                          aria-label={
                            align === "left" ? "Align left" : "Align centre"
                          }
                          checked={style.align === align}
                          onChange={() => setStyle({ ...style, align })}
                        />
                        {align === "left" ? (
                          <IconAlignLeft
                            aria-hidden="true"
                            className="size-4"
                          />
                        ) : (
                          <IconAlignCenter
                            aria-hidden="true"
                            className="size-4"
                          />
                        )}
                        {align === "left" ? "Left" : "Centre"}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="px-0 text-muted-foreground"
                  onClick={() => setStyle(FREE_WELCOME_STYLE)}
                >
                  Reset to free design
                </Button>
              </fieldset>
            </div>
            <aside
              className="min-w-0 space-y-4 lg:sticky lg:top-6"
              aria-label="Live welcome-card preview"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Live preview</h3>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs font-medium text-cyan-300">
                  {premiumPreview ? "Premium · preview only" : "Classic · free"}
                </span>
              </div>
              <WelcomeCardPreview
                style={style}
                subtext={subtext}
                server={overview.name}
              />
              <div className="flex gap-3 rounded-lg border border-primary/15 bg-primary/5 p-4">
                <IconLock
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-cyan-300"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Experiment freely. Your server continues to send Cleo Classic.
                  Premium designs and personalisation are preview-only and
                  cannot yet be activated or saved.
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
      <section
        className="space-y-5 border-t pt-6"
        aria-labelledby="free-welcome-heading"
      >
        <div className="space-y-1">
          <h3 id="free-welcome-heading" className="text-base font-semibold">
            Your active free welcome
          </h3>
          <p className="text-sm text-muted-foreground">
            These settings control the Classic card Cleo sends to Discord.
          </p>
        </div>
        <FieldGroup className="max-w-2xl">
          <Field data-disabled={disabled} orientation="horizontal">
            <FieldContent>
              <FieldTitle>Welcome messages</FieldTitle>
              <FieldDescription>
                Say hello when a new member joins.
              </FieldDescription>
            </FieldContent>
            <Switch
              aria-label="Welcome messages"
              checked={enabled}
              disabled={disabled}
              onCheckedChange={(checked) => {
                setEnabled(checked)
                markDirty()
              }}
            />
          </Field>
          <DiscordChannelSelect
            description="Cleo sends welcome cards to this channel."
            disabled={disabled}
            label="Destination"
            onChange={(value) => {
              setChannelId(value)
              markDirty()
            }}
            optionsState={optionsState}
            value={channelId}
          />
          <Field data-disabled={disabled}>
            <FieldLabel htmlFor="welcome-subtext">Card subtext</FieldLabel>
            <Input
              autoComplete="off"
              disabled={disabled}
              id="welcome-subtext"
              maxLength={120}
              value={subtext}
              placeholder="Settle in, say hello, and enjoy the server."
              onChange={(event) => {
                setSubtext(event.target.value)
                markDirty()
              }}
            />
            <FieldDescription>
              The line below the member name. This is saved with your free
              settings.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled={disabled} type="submit">
            {saveState === "saving"
              ? "Saving free settings…"
              : "Save free settings"}
          </Button>
          {saveState === "success" ? (
            <p role="status" className="text-sm text-emerald-400">
              Free welcome settings saved.
              {overview.welcomeCardStudioAvailable &&
                " Preview styling has not been saved."}
            </p>
          ) : (
            <SaveStatus errorMessage={errorMessage} state={saveState} />
          )}
        </div>
      </section>
    </form>
  )
}
