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
