import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { ReactNode, ReactElement } from "react"

function nodes(node: ReactNode): ReactElement<{
  children?: ReactNode
  onClick?: () => Promise<void>
  disabled?: boolean
}>[] {
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return []
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)]
}
function text(node: ReactNode): string {
  if (typeof node === "string") return node
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return ""
  return React.Children.toArray(node.props.children).map(text).join(" ")
}

test("chat status separates authoritative subscription and bot readiness from OAuth and handles safe Retry", async (t) => {
  const globals = globalThis as typeof globalThis & { React?: typeof React }
  const previousReact = globals.React
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const navigations: string[] = []
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { assign: (url: string) => navigations.push(url) } },
  })
  globals.React = React
  t.after(() => {
    if (previousReact) globals.React = previousReact
    else Reflect.deleteProperty(globals, "React")
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
  })
  let status:
    | {
        activated: boolean
        botReady: boolean
        botValidUntil: number
        chat: string
        authorization: string
      }
    | undefined
  let slots: unknown[] = []
  let index = 0
  let calls = 0
  let outcome = "ready"
  let fail = false
  const effects: (() => (() => void) | undefined)[] = []
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        const slot = index++
        if (!(slot in slots))
          slots[slot] = typeof initial === "function" ? initial() : initial
        return [
          slots[slot],
          (value: unknown) => {
            slots[slot] = value
          },
        ]
      },
      useEffect: (effect: () => (() => void) | undefined) =>
        effects.push(effect),
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useQuery: () => status,
      useAction: () => async () => {
        calls++
        if (fail) throw new Error("private secret")
        return outcome
      },
    },
  })
  const { ChatConnection } = await import("./ChatConnection")
  const render = () => {
    index = 0
    return ChatConnection()
  }
  assert.match(text(render()), /Loading chatbot status/)
  status = {
    activated: false,
    botReady: false,
    botValidUntil: 0,
    chat: "notConnected",
    authorization: "ready",
  }
  assert.match(text(render()), /Verified.*Readiness unavailable.*Not connected/)
  assert.doesNotMatch(text(render()), /Chat connected/)
  assert.match(text(render()), /awaiting service activation/)
  status = {
    ...status,
    activated: true,
    botReady: true,
    botValidUntil: Date.now() + 100000,
    chat: "ready",
  }
  assert.match(text(render()), /Chat connected/)
  const click = async () => {
    await nodes(render())
      .find((node) => node.props.onClick)
      ?.props.onClick?.()
  }
  await click()
  assert.equal(calls, 1)
  outcome = "missingPermission"
  await click()
  assert.match(text(render()), /Missing chat bot permission/)
  fail = true
  await click()
  assert.match(text(render()), /could not verify/)
  assert.doesNotMatch(text(render()), /private secret/)
  status = { ...status, chat: "revoked" }
  assert.equal(
    nodes(render()).find((node) => node.props.onClick)?.props.disabled,
    true
  )
  assert.match(text(render()), /Authorization revoked/)
  fail = false
  outcome = "https://id.twitch.tv/oauth2/authorize?state=server-state"
  const consent = nodes(render()).find(
    (node) => node.props.onClick && text(node).includes("Authorize chatbot")
  )
  assert.equal(consent?.props.disabled, false)
  await consent?.props.onClick?.()
  assert.deepEqual(navigations, [outcome])
  slots = []
  status = { ...status, botValidUntil: Date.now() - 1 }
  assert.match(text(render()), /Readiness unavailable/)
  for (const effect of effects) effect()?.()
})
