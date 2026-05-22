"use client"

import { useState, type FormEvent } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { useMutation } from "convex/react"

import {
  CHANNEL_FIELDS,
  getChannelValues,
  toOptionalChannelValue,
  type ChannelValues,
} from "../lib/config"
import { getErrorMessage } from "../lib/format"
import {
  ChannelFieldGroup,
  ChannelPickerNotice,
  SaveStatus,
} from "../components/workspace-ui"
import type { GuildOverview, SaveState } from "../types"

export function ChannelsSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateChannels = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateChannels.update
  )
  const [values, setValues] = useState<ChannelValues>(() =>
    getChannelValues(overview.guildConfig)
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
      await updateChannels({
        discordGuildId: overview.discordGuildId,
        channels: {
          logChannelId: toOptionalChannelValue(values.logChannelId),
          modLogChannelId: toOptionalChannelValue(values.modLogChannelId),
          welcomeChannelId: toOptionalChannelValue(values.welcomeChannelId),
          updatesChannelId: toOptionalChannelValue(values.updatesChannelId),
          announcementChannelId: toOptionalChannelValue(
            values.announcementChannelId
          ),
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
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            Store Discord channel IDs used by Cleo configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ChannelPickerNotice />
          <ChannelFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            fields={CHANNEL_FIELDS}
            onChange={(key, value) => {
              setValues((currentValues) => ({
                ...currentValues,
                [key]: value,
              }))
              setSaveState("idle")
              setErrorMessage(null)
            }}
            values={values}
          />

          <SaveStatus state={saveState} errorMessage={errorMessage} />

          <div>
            <Button
              disabled={isBotLeft || saveState === "saving"}
              type="submit"
            >
              {saveState === "saving" ? "Saving…" : "Save Channels"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
