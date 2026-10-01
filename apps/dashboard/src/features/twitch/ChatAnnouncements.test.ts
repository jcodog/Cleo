import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import {
  announcementKeys,
  eventDefinitions,
  previewTemplate,
} from "@workspace/shared/twitchEventSub"

type Props = {
  children?: React.ReactNode
  onClick?: () => void
  onCheckedChange?: (value: boolean) => void
  onChange?: (event: { target: { value: string } }) => void
  disabled?: boolean
  title?: string
  value?: string
  checked?: boolean
}
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  return React.isValidElement<Props>(node)
    ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)]
    : []
}
function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  return React.isValidElement<Props>(node)
    ? React.Children.toArray(node.props.children).map(text).join(" ")
    : ""
}
test("announcement rows expose per-event tags, preview, reset and immediate toggles with atomic dirty templates", async (t) => {
  let slots: unknown[] = []
  let index = 0
  const settings: {
    configs: {
      key: string
      enabled: boolean
      template?: string
      updatedAt?: number
    }[]
    subscriptions: {
      key: string
      status:
        "ready" | "failed" | "connecting" | "providerUnavailable" | "revoked"
    }[]
  } = { configs: [], subscriptions: [] }
  const writes: {
    key: string
    enabled: boolean
    template?: string | null
    retry?: boolean
  }[] = []
  let loaded = false
  let failure = false
  let reconnect = ""
  let revision = 0
  let delayQuery = false
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
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
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useQuery: () => (loaded ? settings : undefined),
      useAction: () => async (input: (typeof writes)[number]) => {
        if (failure) throw new Error("Reconnect required. Missing permission.")
        writes.push(input)
        revision++
        if (!delayQuery)
          settings.configs = [
            {
              key: input.key,
              enabled: input.enabled,
              updatedAt: revision,
              ...(input.template ? { template: input.template } : {}),
            },
          ]
        return revision
      },
    },
  })
  for (const [module, name] of [
    ["button", "Button"],
    ["switch", "Switch"],
    ["textarea", "Textarea"],
  ])
    t.mock.module(`@workspace/ui/components/${module}`, {
      exports: { [name!]: name! },
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
  const { ChatAnnouncements, AnnouncementRow } =
    await import("./ChatAnnouncements")
  const onReconnect = (key: string) => {
    reconnect = key
  }
  assert.match(text(ChatAnnouncements({ onReconnect })), /Loading/)
  loaded = true
  assert.match(
    text(ChatAnnouncements({ onReconnect })),
    /Community.*Subscriptions.*Support/
  )
  for (const eventKey of announcementKeys) {
    slots = []
    index = 0
    const row = AnnouncementRow({ eventKey, settings, onReconnect })
    assert.match(text(row), /Using Cleo default/)
    assert.ok(text(row).includes(previewTemplate(eventKey)))
    assert.equal(
      elements(row).filter((node) => node.type === "Button" && node.props.title)
        .length,
      eventDefinitions[eventKey].allowedTemplateTags.length
    )
    assert.equal(
      elements(row).find(
        (node) => node.type === "Button" && text(node) === "Save message"
      )?.props.disabled,
      true
    )
  }
  slots = []
  const render = () => {
    index = 0
    return AnnouncementRow({ eventKey: "follow", settings, onReconnect })
  }
  const button = (label: string) =>
    elements(render()).find(
      (node) => node.type === "Button" && text(node) === label
    )!
  const edit = (value: string) =>
    elements(render()).find((node) => node.type === "Textarea")!.props
      .onChange!({ target: { value } })
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
  render()
  edit("YO {user}! Welcome in 💜")
  assert.equal(button("Save message").props.disabled, false)
  elements(render()).find((node) => node.type === "Switch")!.props
    .onCheckedChange!(true)
  await flush()
  assert.deepEqual(writes.at(-1), {
    key: "follow",
    enabled: true,
    template: "YO {user}! Welcome in 💜",
    retry: false,
  })
  assert.equal(button("Save message").props.disabled, true)
  assert.match(text(render()), /Custom message/)
  edit("Unsaved {channel}")
  elements(render()).find((node) => node.type === "Switch")!.props
    .onCheckedChange!(false)
  await flush()
  assert.deepEqual(writes.at(-1), {
    key: "follow",
    enabled: false,
    template: "YO {user}! Welcome in 💜",
    retry: false,
  })
  assert.equal(
    elements(render()).find((node) => node.type === "Textarea")?.props.value,
    "Unsaved {channel}"
  )
  button("Reset to default").props.onClick!()
  button("Save message").props.onClick!()
  await flush()
  assert.equal(writes.at(-1)?.template, null)
  assert.equal(button("Save message").props.disabled, true)
  elements(render()).find(
    (node) => node.type === "Button" && text(node) === "{user}"
  )!.props.onClick!()
  assert.ok(
    elements(render())
      .find((node) => node.type === "Textarea")
      ?.props.value?.endsWith("{user}")
  )
  edit("{bits}")
  assert.match(text(render()), /Unsupported tag/)
  assert.equal(button("Save message").props.disabled, true)
  assert.equal(
    elements(render()).find((node) => node.type === "Switch")?.props.disabled,
    true
  )
  edit("x".repeat(401))
  assert.match(text(render()), /401.*400.*at most 400/)
  edit("Hi {user}")
  failure = true
  button("Save message").props.onClick!()
  await flush()
  button("Reconnect Twitch").props.onClick!()
  assert.equal(reconnect, "follow")
  failure = false
  settings.configs = [{ key: "follow", enabled: true, template: "Hi {user}" }]
  settings.subscriptions = [{ key: "follow", status: "failed" }]
  button("Retry subscription").props.onClick!()
  await flush()
  assert.equal(writes.at(-1)?.retry, true)
  settings.subscriptions = [{ key: "follow", status: "revoked" }]
  assert.match(text(render()), /Reconnect required/)
  assert.equal(
    elements(render()).some((node) => text(node) === "Retry subscription"),
    false
  )
  button("Reconnect Twitch").props.onClick!()
  assert.equal(reconnect, "follow")
  settings.subscriptions = []
  delayQuery = true
  edit("New saved {user}")
  button("Save message").props.onClick!()
  await flush()
  assert.equal(button("Save message").props.disabled, true)
  assert.equal(
    elements(render()).find((node) => node.type === "Textarea")?.props.value,
    "New saved {user}"
  )
  edit("Next visible {user}")
  assert.equal(
    elements(render()).find((node) => node.type === "Textarea")?.props.value,
    "Next visible {user}"
  )
  assert.equal(button("Save message").props.disabled, false)
  slots = []
  index = 0
  const desired: string[] = []
  const missing = () => {
    index = 0
    return AnnouncementRow({
      eventKey: "follow",
      settings,
      onReconnect,
      approvedScopes: ["channel:bot"],
      onPermissionRequired: (key) => desired.push(key),
    })
  }
  assert.match(
    text(missing()),
    /Reconnect required.*Required permissions:.*moderator:read:followers/
  )
  const before = writes.length
  elements(missing()).find((node) => node.type === "Switch")!.props
    .onCheckedChange!(true)
  await flush()
  assert.equal(writes.length, before)
  assert.deepEqual(desired, ["follow"])
})
