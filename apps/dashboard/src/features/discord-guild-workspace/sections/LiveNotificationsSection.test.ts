import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { LiveNotificationsView } from "./useLiveNotifications"
import type { GuildOverview } from "../types"

type Props = {
  children?: React.ReactNode
  disabled?: boolean
  checked?: boolean
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
  let view: LiveNotificationsView | undefined
  let saveFailure = false
  let accountOpens = 0
  let hookError = false
  let reloads = 0
  const saves: unknown[] = []
  let optionsStatus = "ready"
  const ready: LiveNotificationsView = {
    config: {
      liveNotificationsEnabled: false,
      liveNotificationChannelId: "text",
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
        error: hookError,
        reload: () => {
          reloads++
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
  view = { ...ready, source: { status: "needsLink" } }
  let tree = render(true)
  assert.match(text(tree), /server owner must connect Twitch/)
  assert.match(text(tree), /Your linked Twitch account cannot be used/)
  assert.equal(
    elements(tree).find((node) => node.type === "Switch")?.props.disabled,
    true
  )
  view = { ...view, isOwner: true }
  tree = render(true)
  assert.ok(elements(tree).find((node) => node.props.href === "/twitch"))
  elements(tree)
    .find((node) => node.type === "button" && text(node) === "Manage account")
    ?.props.onClick?.()
  assert.equal(accountOpens, 1)
  for (const status of ["stale", "missingPermission", "unavailable"] as const) {
    view = { ...ready, source: { status } }
    tree = render(true)
    assert.equal(
      elements(tree).find((node) => node.type === "Switch")?.props.disabled,
      true
    )
  }
  view = ready
  tree = render(true)
  const button = () =>
    elements(render()).find((node) => node.props.type === "submit")!
  const channel = (value: string) =>
    elements(render()).find(
      (node) => node.type === selectors.DiscordChannelSelect
    )!.props.onChange!(value)
  const mention = (value: string) =>
    elements(render()).find((node) => node.type === "Select")!.props
      .onValueChange!(value)
  const toggle = async (value: boolean) => {
    elements(render()).find((node) => node.type === "Switch")!.props
      .onCheckedChange!(value)
    await new Promise((resolve) => setImmediate(resolve))
  }
  const save = async () => {
    await render().props.onSubmit?.({ preventDefault() {} })
  }
  assert.equal(button().props.disabled, true)
  assert.doesNotMatch(text(tree), /Refresh connection/)
  channel("announcement")
  assert.equal(button().props.disabled, false)
  await save()
  assert.deepEqual(saves.at(-1), {
    discordGuildId: overview.discordGuildId,
    liveNotificationsEnabled: false,
    liveNotificationChannelId: "announcement",
    liveNotificationMentionMode: "none",
    liveNotificationRoleId: undefined,
  })
  assert.equal(button().props.disabled, true)
  mention("everyone")
  assert.equal(button().props.disabled, false)
  await save()
  assert.equal(button().props.disabled, true)
  await toggle(true)
  assert.equal(
    (saves.at(-1) as { liveNotificationsEnabled: boolean })
      .liveNotificationsEnabled,
    true
  )
  assert.equal(button().props.disabled, true)
  channel("text")
  mention("role")
  assert.equal(button().props.disabled, true)
  elements(render()).find((node) => node.type === selectors.DiscordRoleSelect)!
    .props.onChange!("role")
  assert.equal(button().props.disabled, false)
  await toggle(false)
  assert.equal(
    (saves.at(-1) as { liveNotificationChannelId: string })
      .liveNotificationChannelId,
    "announcement"
  )
  await toggle(true)
  assert.deepEqual(saves.at(-1), {
    discordGuildId: overview.discordGuildId,
    liveNotificationsEnabled: true,
    liveNotificationChannelId: "text",
    liveNotificationMentionMode: "role",
    liveNotificationRoleId: "role",
  })
  assert.equal(button().props.disabled, true)
  channel("deleted")
  assert.equal(button().props.disabled, true)
  await toggle(false)
  const before = saves.length
  await toggle(true)
  assert.equal(saves.length, before)
  assert.equal(
    elements(render()).find((node) => node.type === "Switch")?.props.disabled,
    true
  )
  channel("text")
  mention("none")
  saveFailure = true
  await save()
  assert.ok(slots.includes("Save failed"))
  saveFailure = false
  await save()
  assert.equal(button().props.disabled, true)
  saveFailure = true
  await toggle(true)
  assert.ok(slots.includes("Save failed"))
  assert.equal(
    elements(render()).find((node) => node.type === "Switch")?.props.checked,
    false
  )
  saveFailure = false
  view = { ...ready, botLeft: true }
  render(true)
  assert.equal(button().props.disabled, true)
  view = {
    ...ready,
    config: { ...ready.config, liveNotificationsEnabled: true },
    subscriptionStatus: "connecting",
  }
  assert.match(text(render(true)), /confirming/)
  view = { ...view, subscriptionStatus: "providerUnavailable" }
  optionsStatus = "unavailable"
  assert.match(text(render(true)), /Retry subscription/)
  assert.match(text(render()), /Discord channels and roles are unavailable/)
  elements(render()).find((node) => text(node) === "Retry Discord selectors")!
    .props.onClick!()
  assert.equal(slots[0], 1)
  optionsStatus = "ready"
  elements(render()).find((node) => text(node) === "Retry subscription")!.props
    .onClick!()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal((saves.at(-1) as { retry?: boolean }).retry, true)
  hookError = true
  elements(render()).find((node) => text(node) === "Retry provider check")!
    .props.onClick!()
  assert.equal(reloads, 1)
  hookError = false
  const state = {
    status: "ready" as const,
    options: {
      channels: [{ id: "channel", name: "Live", type: "text" as const }],
      roles: options.roles,
    },
  }
  assert.match(
    text(
      selectors.DiscordChannelSelect({
        description: "destination",
        disabled: false,
        label: "Destination",
        optionsState: state,
        value: "deleted-channel",
        onChange() {},
      })
    ),
    /Missing channel/
  )
  assert.match(
    text(
      selectors.DiscordRoleSelect({
        disabled: false,
        optionsState: state,
        value: "deleted-role",
        onChange() {},
      })
    ),
    /Missing role/
  )
})
