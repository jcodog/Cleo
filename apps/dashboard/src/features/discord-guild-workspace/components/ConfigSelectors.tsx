"use client"

import { useEffect, useState } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@workspace/ui/components/combobox"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useAction } from "convex/react"

import {
  getChannelOptionLabel,
  getMissingRoleIds,
  getSelectedOptionState,
  type DiscordConfigOptions,
} from "../lib/options"

type OptionsState =
  | { status: "loading"; options: null }
  | { status: "ready"; options: DiscordConfigOptions }
  | { status: "unavailable"; options: null }

export function useDiscordConfigOptions(discordGuildId: string): OptionsState {
  const loadOptions = useAction(
    api.actions.dashboard.discord.guilds.configOptions.get
  )
  const [state, setState] = useState<OptionsState>({
    status: "loading",
    options: null,
  })

  useEffect(() => {
    let active = true

    void loadOptions({ discordGuildId })
      .then((result) => {
        if (!active) {
          return
        }

        setState(
          result.status === "ready"
            ? {
                status: "ready",
                options: {
                  channels: result.channels,
                  roles: result.roles,
                },
              }
            : { status: "unavailable", options: null }
        )
      })
      .catch(() => {
        if (active) {
          setState({ status: "unavailable", options: null })
        }
      })

    return () => {
      active = false
    }
  }, [discordGuildId, loadOptions])

  return state
}

export function DiscordChannelSelect({
  description,
  disabled,
  label,
  onChange,
  optionsState,
  value,
}: {
  description: string
  disabled: boolean
  label: string
  onChange: (value: string) => void
  optionsState: OptionsState
  value: string
}) {
  const channels = optionsState.options?.channels ?? []
  const selected = getSelectedOptionState(channels, value)

  return (
    <Field data-disabled={disabled}>
      <FieldLabel>{label}</FieldLabel>
      <Select
        disabled={disabled || optionsState.status !== "ready"}
        value={value || null}
        onValueChange={(nextValue) => onChange(nextValue ?? "")}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              optionsState.status === "loading"
                ? "Loading Discord channels…"
                : optionsState.status === "unavailable"
                  ? "Discord channels unavailable"
                  : "Select a channel"
            }
          >
            {selected.option
              ? getChannelOptionLabel(selected.option)
              : selected.missing
                ? `Missing channel · ${value}`
                : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {selected.missing ? (
              <SelectItem value={value}>Missing channel · {value}</SelectItem>
            ) : null}
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {getChannelOptionLabel(channel)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        {selected.missing
          ? "The saved channel is no longer visible to Cleo. Select a replacement; the saved ID is preserved until you save."
          : description}
      </FieldDescription>
    </Field>
  )
}

export function DiscordRoleMultiSelect({
  disabled,
  onChange,
  optionsState,
  value,
}: {
  disabled: boolean
  onChange: (value: string[]) => void
  optionsState: OptionsState
  value: string[]
}) {
  const roles = optionsState.options?.roles ?? []
  const roleNames = new Map(roles.map((role) => [role.id, role.name]))
  const missingIds = getMissingRoleIds(roles, value)
  const itemIds = [...missingIds, ...roles.map((role) => role.id)]

  return (
    <Field data-disabled={disabled}>
      <FieldLabel>Support staff roles</FieldLabel>
      <Combobox
        disabled={disabled || optionsState.status !== "ready"}
        items={itemIds}
        multiple
        value={value}
        onValueChange={onChange}
      >
        <ComboboxChips>
          <ComboboxValue>
            {value.map((id) => (
              <ComboboxChip key={id}>
                {roleNames.get(id) ?? `Missing role · ${id}`}
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            placeholder={
              optionsState.status === "loading"
                ? "Loading Discord roles…"
                : optionsState.status === "unavailable"
                  ? "Discord roles unavailable"
                  : "Add a role"
            }
          />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>No matching roles.</ComboboxEmpty>
          <ComboboxList>
            {(id) => (
              <ComboboxItem key={id} value={id}>
                {roleNames.get(id) ?? `Missing role · ${id}`}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>
        {missingIds.length > 0
          ? "One or more saved roles no longer exist or are not visible to Cleo. They remain saved until you replace them and save."
          : "New requests mention only these roles."}
      </FieldDescription>
    </Field>
  )
}
