import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { ReactNode } from "react"

function text(node: ReactNode): string {
  if (typeof node === "string") return node
  return React.isValidElement<{ children?: ReactNode }>(node)
    ? React.Children.toArray(node.props.children).map(text).join(" ")
    : ""
}

test("consent callback strips OAuth parameters, requires provider evidence and submits once with safe errors", async (t) => {
  const globals = globalThis as typeof globalThis & { React?: typeof React }
  const previousReact = globals.React
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  globals.React = React
  t.after(() => {
    if (previousReact) globals.React = previousReact
    else Reflect.deleteProperty(globals, "React")
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
  })
  let params = new URLSearchParams()
  let slots: unknown[] = []
  let index = 0
  let effects: (() => void)[] = []
  let fail = false
  const events: string[] = []
  const calls: unknown[] = []
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: {
        replaceState: (_state: unknown, _title: string, path: string) => {
          assert.equal(path, "/twitch/chat-consent")
          events.push("strip")
        },
      },
    },
  })
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        const i = index++
        if (!(i in slots))
          slots[i] = typeof initial === "function" ? initial() : initial
        return [
          slots[i],
          (value: unknown) => {
            slots[i] = value
          },
        ]
      },
      useRef: (initial: unknown) => {
        const i = index++
        if (!(i in slots)) slots[i] = { current: initial }
        return slots[i]
      },
      useEffect: (effect: () => void) => effects.push(effect),
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useAction: () => async (args: unknown) => {
        events.push("finish")
        calls.push(args)
        if (fail) throw new Error("private provider credential")
      },
    },
  })
  t.mock.module("next/navigation", {
    exports: {
      useSearchParams: () => params,
      useRouter: () => ({ replace: (path: string) => events.push(path) }),
    },
  })
  t.mock.module("next/link", { defaultExport: "a" })
  const { TwitchConsentCallback } = await import("./TwitchConsentCallback")
  const render = () => {
    index = 0
    effects = []
    return TwitchConsentCallback()
  }
  const run = async () => {
    render()
    for (const effect of effects) {
      effect()
      effect()
    }
    await new Promise((resolve) => setImmediate(resolve))
  }
  for (const query of [
    "",
    "code=code",
    "state=state",
    "error=private-provider-error&code=code&state=state",
  ]) {
    slots = []
    events.length = 0
    calls.length = 0
    params = new URLSearchParams(query)
    await run()
    assert.deepEqual(events, ["strip"])
    assert.equal(calls.length, 0)
    assert.match(text(render()), /could not be verified/)
    assert.doesNotMatch(text(render()), /private-provider-error/)
  }
  for (const rejected of [false, true]) {
    slots = []
    events.length = 0
    calls.length = 0
    fail = rejected
    params = new URLSearchParams("code=one-time-code&state=server-state")
    await run()
    assert.deepEqual(calls, [{ code: "one-time-code", state: "server-state" }])
    assert.deepEqual(
      events,
      rejected ? ["strip", "finish"] : ["strip", "finish", "/twitch"]
    )
    if (rejected) {
      assert.match(text(render()), /could not be verified/)
      assert.doesNotMatch(text(render()), /private provider credential/)
    }
  }
})
