import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import {
  FREE_WELCOME_STYLE,
  type WelcomeCardStyle,
} from "@workspace/shared/welcomeCard"
import type { GuildOverview } from "../types"

type Props = {
  children?: React.ReactNode
  id?: string
  type?: string
  name?: string
  value?: string
  checked?: boolean
  disabled?: boolean
  style?: WelcomeCardStyle
  "aria-label"?: string
  "aria-invalid"?: boolean
  onChange?: (event: { target: { value: string } }) => void
  onCheckedChange?: (checked: boolean) => void
  onClick?: () => void
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>
}
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  return React.isValidElement<Props>(node)
    ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)]
    : []
}
function copy(node: React.ReactNode): string {
  return typeof node === "string"
    ? node
    : React.isValidElement<Props>(node)
      ? React.Children.toArray(node.props.children).map(copy).join(" ")
      : ""
}

test("welcome studio edits, validates and resets previews while saving only free guild settings", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "React", previous)
    else Reflect.deleteProperty(globalThis, "React")
  })
  let slots: unknown[] = []
  let cursor = 0
  const saves: unknown[] = []
  let fail = false
  let finishSave: (() => void) | undefined
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        const index = cursor++
        if (!(index in slots)) slots[index] = initial
        return [
          slots[index],
          (value: unknown) => {
            slots[index] = value
          },
        ]
      },
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useMutation: () => async (input: unknown) => {
        saves.push(input)
        if (fail) throw new Error("Cannot save")
        await new Promise<void>((resolve) => {
          finishSave = resolve
        })
      },
    },
  })
  t.mock.module("../components/ConfigSelectors.tsx", {
    exports: {
      DiscordChannelSelect: "DiscordChannelSelect",
      useDiscordConfigOptions: () => ({ status: "ready" }),
    },
  })
  t.mock.module("../components/WelcomeCardPreview.tsx", {
    exports: { WelcomeCardPreview: "WelcomeCardPreview" },
  })
  t.mock.module("../components/workspace-ui.tsx", {
    exports: { SaveStatus: "SaveStatus" },
  })
  for (const [module, exports] of [
    ["button", ["Button"]],
    ["input", ["Input"]],
    ["switch", ["Switch"]],
    [
      "field",
      [
        "Field",
        "FieldContent",
        "FieldDescription",
        "FieldGroup",
        "FieldLabel",
        "FieldTitle",
      ],
    ],
  ] satisfies [string, string[]][])
    t.mock.module(`@workspace/ui/components/${module}`, {
      exports: Object.fromEntries(exports.map((name) => [name, name])),
    })
  const { WelcomeSection } = await import("./WelcomeSection")
  const overview = {
    discordGuildId: "123456789012345678",
    name: "Cleo HQ",
    welcomeCardStudioAvailable: true,
    guildConfig: {
      welcomeEnabled: true,
      welcomeChannelId: "234567890123456789",
      welcomeSubtext: "Hello",
    },
  } as GuildOverview
  const render = (isBotLeft = false) => {
    cursor = 0
    return WelcomeSection({ overview, isBotLeft })
  }
  const find = (label: string) => {
    const result = nodes(render()).find(
      (node) => node.props["aria-label"] === label || node.props.id === label
    )
    assert.ok(result, label)
    return result.props
  }
  const selected = () => {
    const preview = nodes(render()).find(
      (node) => node.type === "WelcomeCardPreview" && !("compact" in node.props)
    )
    assert.ok(preview?.props.style)
    return preview.props.style
  }
  assert.deepEqual(selected(), FREE_WELCOME_STYLE)
  find("Aurora").onChange?.({ target: { value: "aurora" } })
  assert.equal(selected().preset, "aurora")
  find("Orchid palette").onChange?.({ target: { value: "orchid" } })
  find("welcome-greeting").onChange?.({
    target: { value: "Hello {member} in {server} 👋🏽" },
  })
  find("Align centre").onChange?.({ target: { value: "center" } })
  assert.deepEqual(selected(), {
    preset: "aurora",
    palette: "orchid",
    greeting: "Hello {member} in {server} 👋🏽",
    align: "center",
  })
  find("Spotlight").onChange?.({ target: { value: "spotlight" } })
  assert.equal(selected().align, "center")
  find("Ribbon").onChange?.({ target: { value: "ribbon" } })
  assert.equal(selected().align, "left")
  find("welcome-greeting").onChange?.({ target: { value: "Hello {unknown}" } })
  assert.equal(find("welcome-greeting")["aria-invalid"], true)
  assert.match(copy(render()), /Use only \{member\} and \{server\}/)
  assert.match(copy(render()), /cannot yet be activated or saved/)
  find("Welcome messages").onCheckedChange?.(false)
  find("welcome-subtext").onChange?.({ target: { value: "Free 👋🏽" } })
  const channel = nodes(render()).find(
    (node) => node.type === "DiscordChannelSelect"
  )
  assert.ok(channel?.props.onChange)
  // The selector uses a string while the native input uses an event.
  Reflect.apply(channel.props.onChange, undefined, ["345678901234567890"])
  const submission = render().props.onSubmit({ preventDefault() {} })
  assert.equal(find("Welcome messages").disabled, true)
  await render().props.onSubmit({ preventDefault() {} })
  assert.equal(saves.length, 1)
  assert.deepEqual(saves[0], {
    discordGuildId: overview.discordGuildId,
    modules: { welcomeEnabled: false },
    channels: { welcomeChannelId: "345678901234567890" },
    welcome: { subtext: "Free 👋🏽", style: FREE_WELCOME_STYLE },
  })
  assert.ok(finishSave)
  finishSave()
  await submission
  assert.match(
    copy(render()),
    /Free welcome settings saved\.\s+Preview styling has not been saved/
  )
  find("welcome-subtext").onChange?.({ target: { value: "" } })
  assert.doesNotMatch(copy(render()), /Free welcome settings saved/)
  fail = true
  await render().props.onSubmit({ preventDefault() {} })
  assert.equal(
    nodes(render()).find((node) => node.type === "SaveStatus")?.props.children,
    undefined
  )
  assert.equal(slots.at(-1), "Cannot save")
  const before = saves.length
  await render(true).props.onSubmit({ preventDefault() {} })
  assert.equal(saves.length, before)
  nodes(render())
    .find(
      (node) => node.type === "Button" && copy(node) === "Reset to free design"
    )
    ?.props.onClick?.()
  assert.deepEqual(selected(), FREE_WELCOME_STYLE)
  find("Cleo Classic").onChange?.({ target: { value: "classic" } })
  assert.equal(find("welcome-greeting")["aria-invalid"], false)
  slots = []
  const empty = {
    discordGuildId: overview.discordGuildId,
    name: "Cleo",
  } as GuildOverview
  cursor = 0
  const freeOnly = WelcomeSection({ isBotLeft: false, overview: empty })
  assert.deepEqual(slots.slice(0, 3), [false, "", ""])
  assert.equal(
    nodes(freeOnly).some(
      (node) =>
        node.type === "WelcomeCardPreview" ||
        node.props.name === "welcome-preset"
    ),
    false
  )
  assert.doesNotMatch(copy(freeOnly), /Premium|Live preview|preview-only/)
  assert.match(copy(freeOnly), /These settings control the Classic card/)
  cursor = 0
  const denied = WelcomeSection({
    isBotLeft: false,
    overview: { ...overview, welcomeCardStudioAvailable: false },
  })
  assert.equal(
    nodes(denied).some((node) => node.type === "WelcomeCardPreview"),
    false
  )
})
