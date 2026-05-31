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

import { getErrorMessage } from "../lib/format"
import { getModuleValues, type ModuleValues } from "../lib/config"
import { ModuleFieldGroup, SaveStatus } from "../components/workspace-ui"
import type { GuildOverview, SaveState } from "../types"

export function ModulesSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateModules = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateModules.update
  )
  const [values, setValues] = useState<ModuleValues>(() =>
    getModuleValues(overview.guildConfig)
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
      await updateModules({
        discordGuildId: overview.discordGuildId,
        modules: values,
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
          <CardTitle>Modules</CardTitle>
          <CardDescription>
            Toggle schema-backed module flags for this Discord server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ModuleFieldGroup
            disabled={isBotLeft || saveState === "saving"}
            onChange={(key, checked) => {
              setValues((currentValues) => ({
                ...currentValues,
                [key]: checked,
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
              {saveState === "saving" ? "Saving…" : "Save Modules"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
