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
  FieldTitle,
} from "@workspace/ui/components/field"
import { Switch } from "@workspace/ui/components/switch"
import { useMutation } from "convex/react"

import {
  MODERATION_CHANNEL_FIELDS,
  toOptionalChannelValue,
  type ChannelValues,
} from "../lib/config"
import { getErrorMessage } from "../lib/format"
import { ChannelFieldGroup, SaveStatus } from "../components/workspace-ui"
import type { GuildOverview, SaveState } from "../types"

export function ModerationSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateWorkspaceSection = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection.update
  )
  const [moderationEnabled, setModerationEnabled] = useState(
    overview.guildConfig?.moderationEnabled ?? false
  )
  const [channels, setChannels] = useState<
    Pick<ChannelValues, "modLogChannelId" | "logChannelId">
  >(() => ({
    modLogChannelId: overview.guildConfig?.modLogChannelId ?? "",
    logChannelId: overview.guildConfig?.logChannelId ?? "",
  }))
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
        modules: { moderationEnabled },
        channels: {
          modLogChannelId: toOptionalChannelValue(channels.modLogChannelId),
          logChannelId: toOptionalChannelValue(channels.logChannelId),
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
          <CardTitle>Moderation</CardTitle>
          <CardDescription>
            Configure stored moderation settings without inventing live
            enforcement data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <IconInfoCircle aria-hidden />
            <AlertTitle>Runtime Enforcement Pending</AlertTitle>
            <AlertDescription>
              These settings prepare the dashboard config. Moderation actions
              and enforcement start only after the Discord bot runtime migration
              is complete.
            </AlertDescription>
          </Alert>

          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                aria-label="Moderation"
                checked={moderationEnabled}
                disabled={isBotLeft || saveState === "saving"}
                onCheckedChange={(checked) => {
                  setModerationEnabled(checked)
                  setSaveState("idle")
                  setErrorMessage(null)
                }}
              />
              <FieldContent>
                <FieldTitle>Moderation</FieldTitle>
                <FieldDescription>
                  Store whether moderation should be active for this server.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <ChannelFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            fields={MODERATION_CHANNEL_FIELDS}
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
              {saveState === "saving" ? "Saving…" : "Save Moderation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
