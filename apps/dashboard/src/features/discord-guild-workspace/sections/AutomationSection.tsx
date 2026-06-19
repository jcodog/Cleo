"use client"

import { useState, type FormEvent } from "react"
import { IconInfoCircle } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
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
  AUTOMATION_CHANNEL_FIELDS,
  toOptionalChannelValue,
  toOptionalTextValue,
  type ChannelValues,
} from "../lib/config"
import { getErrorMessage } from "../lib/format"
import { ChannelFieldGroup, SaveStatus } from "../components/workspace-ui"
import type { GuildOverview, SaveState } from "../types"

export function AutomationSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateWorkspaceSection = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection.update
  )
  const [welcomeEnabled, setWelcomeEnabled] = useState(
    overview.guildConfig?.welcomeEnabled ?? false
  )
  const [channels, setChannels] = useState<
    Pick<
      ChannelValues,
      "welcomeChannelId" | "updatesChannelId" | "announcementChannelId"
    >
  >(() => ({
    welcomeChannelId: overview.guildConfig?.welcomeChannelId ?? "",
    updatesChannelId: overview.guildConfig?.updatesChannelId ?? "",
    announcementChannelId: overview.guildConfig?.announcementChannelId ?? "",
  }))
  const [welcomeSubtext, setWelcomeSubtext] = useState(
    overview.guildConfig?.welcomeSubtext ?? ""
  )
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isBotLeft) {
      return
    }

    setSaveState("saving")
    setErrorMessage(null)

    try {
      await updateWorkspaceSection({
        discordGuildId: overview.discordGuildId,
        modules: { welcomeEnabled },
        channels: {
          welcomeChannelId: toOptionalChannelValue(channels.welcomeChannelId),
          updatesChannelId: toOptionalChannelValue(channels.updatesChannelId),
          announcementChannelId: toOptionalChannelValue(
            channels.announcementChannelId
          ),
        },
        welcome: {
          subtext: toOptionalTextValue(welcomeSubtext),
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
          <CardTitle>Automation</CardTitle>
          <CardDescription>
            Configure stored welcome and announcement destinations.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <IconInfoCircle aria-hidden />
            <AlertTitle>Welcome Runtime Active</AlertTitle>
            <AlertDescription>
              Welcome messages are delivered by the Discord bot from saved
              runtime config. Announcements are stored for later runtime work.
            </AlertDescription>
          </Alert>

          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                aria-label="Welcome automation"
                checked={welcomeEnabled}
                disabled={isBotLeft || saveState === "saving"}
                onCheckedChange={(checked) => {
                  setWelcomeEnabled(checked)
                  setSaveState("idle")
                  setErrorMessage(null)
                }}
              />
              <FieldContent>
                <FieldTitle>Welcome Automation</FieldTitle>
                <FieldDescription>
                  Store whether new member welcome handling should be enabled.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="welcomeSubtext">Welcome Subtext</FieldLabel>
            <Input
              autoComplete="off"
              disabled={isBotLeft || saveState === "saving"}
              id="welcomeSubtext"
              maxLength={120}
              name="welcomeSubtext"
              onChange={(event) => {
                setWelcomeSubtext(event.target.value)
                setSaveState("idle")
                setErrorMessage(null)
              }}
              placeholder="Settle in, say hello, and enjoy the server."
              value={welcomeSubtext}
            />
            <FieldDescription>
              Optional line shown under the member name on welcome cards.
            </FieldDescription>
          </Field>

          <ChannelFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            fields={AUTOMATION_CHANNEL_FIELDS}
            onChange={(key, value) => {
              setChannels((currentChannels) => ({
                ...currentChannels,
                [key]: value,
              }))
              setSaveState("idle")
              setErrorMessage(null)
            }}
            values={channels}
          />

          <SaveStatus state={saveState} errorMessage={errorMessage} />

          <div>
            <Button
              disabled={isBotLeft || saveState === "saving"}
              type="submit"
            >
              {saveState === "saving" ? "Saving…" : "Save Automation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
