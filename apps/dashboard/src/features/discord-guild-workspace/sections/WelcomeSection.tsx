"use client"

import { useState, type FormEvent } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Switch } from "@workspace/ui/components/switch"
import { useMutation } from "convex/react"

import {
  DiscordChannelSelect,
  useDiscordConfigOptions,
} from "../components/ConfigSelectors"
import { SaveStatus } from "../components/workspace-ui"
import { toOptionalChannelValue, toOptionalTextValue } from "../lib/config"
import { getErrorMessage } from "../lib/format"
import type { GuildOverview, SaveState } from "../types"
import {
  FREE_WELCOME_STYLE,
  WELCOME_PALETTES,
  WELCOME_PRESETS,
  isFreeWelcomeStyle,
  parseWelcomeCardStyle,
  type WelcomeCardStyle,
} from "@workspace/shared/welcomeCard"
import { WelcomeCardPreview } from "../components/WelcomeCardPreview"

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
  const premiumPreview = !isFreeWelcomeStyle(style)
  let styleError: string | undefined
  try {
    parseWelcomeCardStyle(style)
  } catch {
    styleError =
      "Use 1 to 120 characters and only {member} or {server} placeholders."
  }
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const disabled = isBotLeft || saveState === "saving"

  function markDirty() {
    setSaveState("idle")
    setErrorMessage(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (disabled) {
      return
    }

    setSaveState("saving")
    setErrorMessage(null)

    try {
      await updateWorkspaceSection({
        discordGuildId: overview.discordGuildId,
        modules: { welcomeEnabled: enabled },
        channels: {
          welcomeChannelId: toOptionalChannelValue(channelId),
        },
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
    <form className="max-w-3xl" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Configure the welcome card Cleo sends when a member joins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-disabled={disabled} orientation="horizontal">
              <FieldContent>
                <FieldTitle>Welcome messages</FieldTitle>
                <FieldDescription>
                  Send the current Cleo welcome card to new members.
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
                onChange={(event) => {
                  setSubtext(event.target.value)
                  markDirty()
                }}
                placeholder="Settle in, say hello, and enjoy the server."
                value={subtext}
              />
              <FieldDescription>
                Optional line shown below the member name.
              </FieldDescription>
            </Field>

            <fieldset className="space-y-4" disabled={disabled}>
              <legend className="mb-3 text-sm font-medium">Card design</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {WELCOME_PRESETS.map((preset) => (
                  <label
                    key={preset.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 has-checked:border-primary"
                  >
                    <input
                      type="radio"
                      name="welcome-preset"
                      value={preset.id}
                      checked={style.preset === preset.id}
                      onChange={() =>
                        setStyle(
                          preset.premium
                            ? { ...style, preset: preset.id }
                            : FREE_WELCOME_STYLE
                        )
                      }
                    />
                    <span>
                      {preset.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        {preset.premium ? "Premium preview" : "Free"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <Field>
                <FieldLabel htmlFor="welcome-palette">
                  Colour palette
                </FieldLabel>
                <NativeSelect
                  id="welcome-palette"
                  value={style.palette}
                  onChange={(event) => {
                    const palette = event.target.value
                    if (
                      palette === "cyan" ||
                      palette === "orchid" ||
                      palette === "forest" ||
                      palette === "amber"
                    )
                      setStyle({ ...style, palette })
                  }}
                >
                  {Object.keys(WELCOME_PALETTES).map((palette) => (
                    <NativeSelectOption key={palette} value={palette}>
                      {palette}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
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
                <FieldDescription id="welcome-greeting-help">
                  {styleError ?? (
                    <>
                      Premium preview. Use {"{member}"} and {"{server}"} to
                      personalise the greeting. Unicode and Discord emoji are
                      supported.
                    </>
                  )}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="welcome-alignment">
                  Text alignment
                </FieldLabel>
                <NativeSelect
                  id="welcome-alignment"
                  value={style.align}
                  onChange={(event) =>
                    setStyle({
                      ...style,
                      align:
                        event.target.value === "center" ? "center" : "left",
                    })
                  }
                >
                  <NativeSelectOption value="left">Left</NativeSelectOption>
                  <NativeSelectOption value="center">Centre</NativeSelectOption>
                </NativeSelect>
              </Field>
              <FieldDescription>
                Premium designs and custom styling are preview-only until guild
                Premium checks are ready. Save Welcome saves your free
                destination, enable switch and subtext. These previews are not
                sent to Discord.
              </FieldDescription>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStyle(FREE_WELCOME_STYLE)}
              >
                Reset to free design
              </Button>
            </fieldset>
            <WelcomeCardPreview
              style={style}
              subtext={subtext}
              server={overview.name}
            />
            {premiumPreview && (
              <FieldDescription role="status">
                Viewing Premium styling. Your server continues to send Cleo
                Classic.
              </FieldDescription>
            )}
            <SaveStatus errorMessage={errorMessage} state={saveState} />
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button disabled={disabled} type="submit">
            {saveState === "saving" ? "Saving…" : "Save Welcome"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
