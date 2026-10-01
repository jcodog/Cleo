import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { GuildOverview } from "../types"
import type { LiveNotificationsView } from "./useLiveNotifications"

type Props = {
  children?: React.ReactNode
  label?: string
  href?: string
  stateLabel?: string
  enabled?: boolean
}
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!React.isValidElement<Props>(node)) return []
  return [
    node,
    ...React.Children.toArray(node.props.children).flatMap(elements),
  ]
}

test("Overview renders live readiness, failure and loading with the dedicated navigation target", async (t) => {
  let view: LiveNotificationsView | undefined
  let error = false
  t.mock.module("./useLiveNotifications.tsx", {
    exports: { useLiveNotifications: () => ({ view, error }) },
  })
  t.mock.module("convex/react", {
    exports: { useQuery: () => ({ status: "ready", events: [] }) },
  })
  t.mock.module("next/link", { defaultExport: "a" })
  t.mock.module("../components/workspace-ui.tsx", {
    exports: { BotStatusBadge: "BotStatusBadge" },
  })
  for (const [module, names] of [
    [
      "card",
      ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"],
    ],
    ["badge", ["Badge"]],
    ["skeleton", ["Skeleton"]],
  ] satisfies [string, string[]][])
    t.mock.module(`@workspace/ui/components/${module}`, {
      exports: Object.fromEntries(names.map((name) => [name, name])),
    })
  t.mock.module("@workspace/ui/components/button", {
    exports: { buttonVariants: () => "button" },
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
  const { OverviewSection } = await import("./OverviewSection")
  const overview = {
    discordGuildId: "123456789012345678",
    name: "Test server",
    guildConfig: null,
  } as GuildOverview
  const entry = () =>
    elements(OverviewSection({ overview, isBotLeft: false })).find(
      (node) => node.props.label === "Live notifications"
    )!
  assert.equal(entry().props.stateLabel, "Loading")
  error = true
  assert.equal(entry().props.stateLabel, "Unavailable")
  error = false
  view = {
    config: {
      liveNotificationsEnabled: true,
      liveNotificationMentionMode: "none",
      liveNotificationChannelId: "channel",
    },
    source: {
      status: "ready",
      broadcasterId: "222",
      displayName: "Owner",
      login: "owner",
    },
    isOwner: false,
    botLeft: false,
    discordStatus: "ready",
    subscriptionStatus: "ready",
  }
  assert.equal(entry().props.stateLabel, "Ready")
  assert.equal(entry().props.enabled, true)
  assert.equal(
    entry().props.href,
    `/dashboard/${overview.discordGuildId}/live-notifications`
  )
  const rendered = (
    entry().type as (props: Props) => React.ReactElement<Props>
  )(entry().props)
  assert.equal(rendered.props.href, entry().props.href)
  view = { ...view, subscriptionStatus: "unavailable" }
  assert.equal(entry().props.enabled, false)
})
