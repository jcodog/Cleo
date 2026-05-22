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

import { getErrorMessage } from "../lib/format"
import type { ModuleValues } from "../lib/config"
import { ReadinessRow, SaveStatus } from "../components/workspace-ui"
import type { GuildOverview, SaveState } from "../types"

export function CommandsSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  const updateModules = useMutation(
    api.mutations.dashboard.discord.guildConfigs.updateModules.update
  )
  const [values, setValues] = useState<
    Pick<ModuleValues, "aiEnabled" | "loggingEnabled">
  >(() => ({
    aiEnabled: overview.guildConfig?.aiEnabled ?? true,
    loggingEnabled: overview.guildConfig?.loggingEnabled ?? false,
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Commands</CardTitle>
            <CardDescription>
              Configure command readiness flags stored for this server.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Alert>
              <IconInfoCircle aria-hidden />
              <AlertTitle>Command Runtime Pending</AlertTitle>
              <AlertDescription>
                Command execution requires the future Discord bot migration.
                This page only controls stored readiness settings.
              </AlertDescription>
            </Alert>

            <FieldGroup>
              <Field orientation="horizontal">
                <Switch
                  aria-label="AI assistant commands"
                  checked={values.aiEnabled}
                  disabled={isBotLeft || saveState === "saving"}
                  onCheckedChange={(checked) => {
                    setValues((currentValues) => ({
                      ...currentValues,
                      aiEnabled: checked,
                    }))
                    setSaveState("idle")
                    setErrorMessage(null)
                  }}
                />
                <FieldContent>
                  <FieldTitle>AI Assistant Commands</FieldTitle>
                  <FieldDescription>
                    Store whether assistant command responses should be enabled.
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <Switch
                  aria-label="Command logging"
                  checked={values.loggingEnabled}
                  disabled={isBotLeft || saveState === "saving"}
                  onCheckedChange={(checked) => {
                    setValues((currentValues) => ({
                      ...currentValues,
                      loggingEnabled: checked,
                    }))
                    setSaveState("idle")
                    setErrorMessage(null)
                  }}
                />
                <FieldContent>
                  <FieldTitle>Command Logging</FieldTitle>
                  <FieldDescription>
                    Store whether command-related runtime events should be
                    logged.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>

            <SaveStatus state={saveState} errorMessage={errorMessage} />

            <div>
              <Button
                disabled={isBotLeft || saveState === "saving"}
                type="submit"
              >
                {saveState === "saving" ? "Saving…" : "Save Commands"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Command Readiness</CardTitle>
          <CardDescription>
            Runtime categories without pretending execution exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <ReadinessRow
              label="Assistant"
              ready={values.aiEnabled}
              value={values.aiEnabled ? "Configured" : "Disabled"}
            />
            <ReadinessRow
              label="Logging"
              ready={values.loggingEnabled}
              value={values.loggingEnabled ? "Configured" : "Disabled"}
            />
            <ReadinessRow
              label="Runtime"
              ready={false}
              value="Bot Migration Pending"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
