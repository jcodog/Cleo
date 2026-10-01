import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { LiveNotificationsView } from "./useLiveNotifications"
import type { GuildOverview } from "../types"

type Props = {
  children?: React.ReactNode
  disabled?: boolean
  value?: string
  type?: string
  href?: string
  optionsState?: { options: { channels: { type: string }[] } }
  onClick?: () => void
  onCheckedChange?: (value: boolean) => void
  onValueChange?: (value: string) => void
  onChange?: (value: string) => void
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>
  id?: string
  htmlFor?: string
}
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!React.isValidElement<Props>(node)) return []
  return [
    node,
    ...React.Children.toArray(node.props.children).flatMap(elements),
  ]
}
function text(node: React.ReactNode): string {
  if (typeof node === "string") return node
  if (!React.isValidElement<Props>(node)) return ""
  return React.Children.toArray(node.props.children).map(text).join(" ")
}

test("live notification form fixes owner source, handles linking, destinations, mentions, saves and outages", async (t) => {
  let slots: unknown[] = []
  let index = 0
  let error = false
  let view: LiveNotificationsView | undefined
  let saveFailure = false
  let refreshes = 0
  let accountOpens = 0
  const saves: unknown[] = []
  let optionsStatus = "ready"
  const ready: LiveNotificationsView = {
    config: {
      liveNotificationsEnabled: false,
      liveNotificationMentionMode: "none",
    },
    source: {
      status: "ready",
      broadcasterId: "222",
      login: "owner",
      displayName: "Server owner",
      avatarUrl: "https://example.com/avatar",
    },
    isOwner: false,
    botLeft: false,
    subscriptionStatus: "ready",
    discordStatus: "ready",
  }
  const options = {
    channels: [
      { id: "text", name: "live", type: "text" },
      { id: "announcement", name: "news", type: "announcement" },
      { id: "forum", name: "forum", type: "forum" },
      { id: "thread", name: "thread", type: "thread" },
    ],
    roles: [
      { id: "everyone", name: "@everyone" },
      { id: "role", name: "Viewers" },
    ],
  }
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        if (
          initial &&
          typeof initial === "object" &&
          "status" in initial &&
          initial.status === "loading"
        )
          return [
            {
              ...initial,
              status: optionsStatus,
              options: optionsStatus === "ready" ? options : null,
            },
            () => {},
          ]
        const slot = index++
        if (!(slot in slots)) slots[slot] = initial
        return [
          slots[slot],
          (value: unknown) => {
            slots[slot] =
              typeof value === "function" ? value(slots[slot]) : value
          },
        ]
      },
      useEffect: () => {},
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: {
      useClerk: () => ({
        openUserProfile: () => {
          accountOpens++
        },
      }),
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useAction: () => async (input: unknown) => {
        if (saveFailure) throw new Error("Save failed")
        saves.push(input)
        return 50
      },
    },
  })
  t.mock.module("./useLiveNotifications.tsx", {
    exports: {
      useLiveNotifications: () => ({
        view,
        error,
        refresh: () => {
          refreshes++
        },
      }),
    },
  })
  t.mock.module("../components/workspace-ui.tsx", {
    exports: { SaveStatus: "SaveStatus" },
  })
  t.mock.module("next/link", { defaultExport: "a" })
  for (const [module, names] of [
    ["avatar", ["Avatar", "AvatarFallback", "AvatarImage"]],
    ["badge", ["Badge"]],
    ["switch", ["Switch"]],
    ["skeleton", ["Skeleton"]],
    [
      "select",
      [
        "Select",
        "SelectContent",
        "SelectGroup",
        "SelectItem",
        "SelectTrigger",
        "SelectValue",
      ],
    ],
    ["field", ["Field", "FieldLabel", "FieldDescription"]],
    [
      "combobox",
      [
        "Combobox",
        "ComboboxChip",
        "ComboboxChips",
        "ComboboxChipsInput",
        "ComboboxContent",
        "ComboboxEmpty",
        "ComboboxItem",
        "ComboboxList",
        "ComboboxValue",
      ],
    ],
  ] satisfies [string, string[]][])
    t.mock.module(`@workspace/ui/components/${module}`, {
      exports: Object.fromEntries(names.map((name) => [name, name])),
    })
  t.mock.module("@workspace/ui/components/button", {
    exports: { Button: "button", buttonVariants: () => "button" },
  })
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "React", previous)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const { LiveNotificationsSection } =
    await import("./LiveNotificationsSection")
  const selectors = await import("../components/ConfigSelectors")
  const overview = { discordGuildId: "123456789012345678" } as GuildOverview
  const render = (reset = false) => {
    if (reset) slots = []
    index = 0
    const section = LiveNotificationsSection({ overview, isBotLeft: false })
    if (typeof section.type === "function") return section.type(section.props)
    return section
  }
  assert.equal(render().type, "Skeleton")
  error = true
  assert.match(text(render()), /unavailable/)
  elements(render())
    .find((node) => node.type === "button")
    ?.props.onClick?.()
  error = false
  view = { ...ready, source: { status: "needsLink" } }
  let tree = render(true)
  assert.match(text(tree), /server owner must connect Twitch/)
  assert.match(text(tree), /Your linked Twitch account cannot be used/)
  assert.equal(
    elements(tree).some((node) => node.props.href === "/twitch"),
    false
  )
  assert.equal(
    elements(tree).find((node) => node.type === "Switch")?.props.disabled,
    true
  )
  view = { ...view, isOwner: true }
  tree = render(true)
  assert.equal(
    elements(tree).find((node) => node.props.href === "/twitch")?.props
      .children,
    "Connect or reconnect Twitch"
  )
  elements(tree)
    .find((node) => text(node) === "Manage account")
    ?.props.onClick?.()
  assert.equal(accountOpens, 1)
  for (const status of ["stale", "missingPermission", "unavailable"] as const) {
    view = { ...ready, source: { status } }
    tree = render(true)
    assert.equal(
      elements(tree).find((node) => node.type === "Switch")?.props.disabled,
      true
    )
    assert.match(
      text(tree),
      status === "stale"
        ? /stale/
        : status === "missingPermission"
          ? /required permission/
          : /cannot verify/
    )
  }
  view = ready
  tree = render(true)
  assert.match(text(tree), /twitch.tv\/owner/)
  assert.equal(
    elements(tree).filter((node) => node.type === "Select").length,
    1
  )
  const destination = elements(tree).find(
    (node) => node.type === selectors.DiscordChannelSelect
  )
  assert.deepEqual(
    destination?.props.optionsState?.options.channels.map(
      (channel) => channel.type
    ),
    ["text", "announcement"]
  )
  elements(tree)
    .find((node) => node.type === "Switch")
    ?.props.onCheckedChange?.(true)
  destination?.props.onChange?.("234567890123456789")
  elements(tree)
    .find((node) => node.type === "Select")
    ?.props.onValueChange?.("role")
  tree = render()
  elements(tree)
    .find((node) => node.type === selectors.DiscordRoleSelect)
    ?.props.onChange?.("345678901234567890")
  tree = render()
  await tree.props.onSubmit?.({ preventDefault() {} })
  assert.deepEqual(saves[0], {
    discordGuildId: overview.discordGuildId,
    liveNotificationsEnabled: true,
    liveNotificationChannelId: "234567890123456789",
    liveNotificationMentionMode: "role",
    liveNotificationRoleId: "345678901234567890",
  })
  for (const mode of ["everyone", "none"]) {
    tree = render()
    elements(tree)
      .find((node) => node.type === "Select")
      ?.props.onValueChange?.(mode)
    tree = render()
    assert.equal(
      elements(tree).some((node) => node.type === selectors.DiscordRoleSelect),
      false
    )
    await tree.props.onSubmit?.({ preventDefault() {} })
    assert.equal(
      (saves.at(-1) as { liveNotificationRoleId?: string })
        .liveNotificationRoleId,
      undefined
    )
  }
  saveFailure = true
  tree = render()
  await tree.props.onSubmit?.({ preventDefault() {} })
  assert.equal(slots.includes("error"), true)
  assert.equal(slots.includes("Save failed"), true)
  view = { ...ready, botLeft: true }
  tree = render(true)
  assert.equal(
    elements(tree).find((node) => node.props.type === "submit")?.props.disabled,
    true
  )
  view = {
    ...ready,
    config: {
      liveNotificationsEnabled: true,
      liveNotificationMentionMode: "none",
      liveNotificationChannelId: "saved",
    },
    subscriptionStatus: "pending",
  }
  assert.match(text(render(true)), /confirming/)
  view = { ...view, subscriptionStatus: "unavailable" }
  optionsStatus = "unavailable"
  assert.match(text(render(true)), /runtime is unavailable/)
  assert.match(text(render()), /Discord channels and roles are unavailable/)
  assert.ok(refreshes >= 4)
  const state = {
    status: "ready" as const,
    options: {
      channels: [{ id: "channel", name: "Live", type: "text" as const }],
      roles: options.roles,
    },
  }
  const missingChannel = selectors.DiscordChannelSelect({
    description: "destination",
    disabled: false,
    label: "Destination",
    optionsState: state,
    value: "deleted-channel",
    onChange() {},
  })
  assert.match(text(missingChannel), /Missing channel · deleted-channel/)
  const missingRole = selectors.DiscordRoleSelect({
    disabled: false,
    optionsState: state,
    value: "deleted-role",
    onChange() {},
  })
  assert.match(text(missingRole), /Missing role · deleted-role/)
  assert.equal(text(missingRole).includes("@everyone"), false)
  assert.equal(
    elements(missingRole).find((node) => node.type === "FieldLabel")?.props
      .htmlFor,
    "live-notification-custom-role"
  )
  assert.equal(
    elements(missingRole).find((node) => node.type === "SelectTrigger")?.props
      .id,
    "live-notification-custom-role"
  )
  assert.match(
    text(
      selectors.DiscordRoleSelect({
        disabled: false,
        optionsState: state,
        value: "role",
        onChange() {},
      })
    ),
    /Viewers/
  )
  saveFailure = false
  optionsStatus = "ready"
  view = {
    ...ready,
    config: { ...ready.config, liveNotificationMentionMode: "role" },
  }
  tree = render(true)
  assert.equal(
    elements(tree).find((node) => node.props.type === "submit")?.props.disabled,
    true
  )
  const savedConfig = {
    ...ready.config,
    _id: "config",
    _creationTime: 1,
    guildId: "guild",
    createdAt: 1,
    updatedAt: 1,
  } as LiveNotificationsView["config"]
  view = { ...ready, config: savedConfig }
  tree = render(true)
  elements(tree)
    .find((node) => node.type === selectors.DiscordChannelSelect)
    ?.props.onChange?.("dirty-channel")
  view = {
    ...view,
    config: {
      ...savedConfig,
      liveNotificationChannelId: "remote-channel",
      updatedAt: 2,
    } as LiveNotificationsView["config"],
  }
  render()
  tree = render()
  assert.equal(
    elements(tree).find((node) => node.type === selectors.DiscordChannelSelect)
      ?.props.value,
    "dirty-channel"
  )
  error = true
  tree = render()
  assert.match(text(tree), /Connection refresh failed/)
  assert.equal(
    elements(tree).find((node) => node.type === selectors.DiscordChannelSelect)
      ?.props.value,
    "dirty-channel"
  )
  error = false
  tree = render()
  await tree.props.onSubmit?.({ preventDefault() {} })
  render()
  tree = render()
  assert.equal(slots.includes("success"), true)
  assert.equal(
    elements(tree).find((node) => node.type === selectors.DiscordChannelSelect)
      ?.props.value,
    "dirty-channel"
  )
  const beforeRefresh = refreshes
  elements(tree)
    .find(
      (node) => node.type === "button" && text(node) === "Refresh connection"
    )
    ?.props.onClick?.()
  assert.equal(refreshes, beforeRefresh + 1)
  assert.equal(slots[0], 1)
})
