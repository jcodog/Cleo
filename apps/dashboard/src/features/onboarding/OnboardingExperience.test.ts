import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { getFunctionName } from "convex/server"

test("actual onboarding completion preserves the protected destination and waits for a successful save", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  let effects: (() => void)[] = []
  let stateIndex = 0
  let completedAt: number | null = null
  let saveFailure = false
  const events: string[] = []
  let finishSave: (() => void) | undefined
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => [
        stateIndex++ === 0 ? "ready" : initial,
        () => undefined,
      ],
      useCallback: (callback: unknown) => callback,
      useRef: (initial: unknown) => ({ current: initial }),
      useEffect: (effect: () => void) => effects.push(effect),
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: { useUser: () => ({ user: null }) },
  })
  t.mock.module("convex/react", {
    exports: {
      useQuery: (query: Parameters<typeof getFunctionName>[0]) =>
        getFunctionName(query).includes("onboarding")
          ? {
              status: "ready",
              account: {
                onboardingCompletedAt: completedAt,
                onboardingVersion: 1,
                onboardingProvenance: "post-rollout",
              },
              discordIdentity: null,
            }
          : [{ discordGuildId: "123", name: "Server" }],
      useMutation: () => async () => {
        events.push("save")
        await new Promise<void>((resolve) => {
          finishSave = resolve
        })
        if (saveFailure) throw new Error("save failed")
        events.push("saved")
      },
    },
  })
  t.mock.module("next/navigation", {
    exports: {
      useRouter: () => ({ replace: (path: string) => events.push(path) }),
    },
  })
  t.mock.module(
    new URL("../../components/backgrounds/DotGrid.tsx", import.meta.url).href,
    { exports: { DotGrid: () => null } }
  )
  t.mock.module(
    new URL("../app-shell/DashboardDiscordHydrator.tsx", import.meta.url).href,
    { exports: { DashboardDiscordHydrator: () => null } }
  )
  const { OnboardingExperience } = await import("./OnboardingExperience")
  type ReadyProps = {
    children?: React.ReactNode
    onContinue?: (path: string) => Promise<void>
  }
  function readyPanel(
    node: React.ReactNode
  ): React.ReactElement<ReadyProps> | undefined {
    if (!React.isValidElement<ReadyProps>(node)) return undefined
    if (node.props.onContinue) return node
    return React.Children.toArray(node.props.children)
      .map(readyPanel)
      .find(Boolean)
  }
  function render(returnTo: string | null) {
    stateIndex = 0
    effects = []
    return OnboardingExperience({ returnTo })
  }
  const cases: [string | null, string][] = [
    ["/twitch?tab=chat", "/twitch?tab=chat"],
    [null, "/dashboard/123"],
    ["//evil.example", "/dashboard/123"],
  ]
  for (const [returnTo, expected] of cases) {
    events.length = 0
    const panel = readyPanel(render(returnTo))
    assert.ok(panel)
    assert.ok(panel.props.onContinue)
    const completion = panel.props.onContinue("/dashboard/123")
    assert.deepEqual(events, ["save"])
    assert.ok(finishSave)
    finishSave()
    await completion
    assert.deepEqual(events, ["save", "saved", expected])
  }
  events.length = 0
  saveFailure = true
  const panel = readyPanel(render("/twitch?tab=chat"))
  assert.ok(panel)
  assert.ok(panel.props.onContinue)
  const completion = panel.props.onContinue("/dashboard/123")
  assert.ok(finishSave)
  finishSave()
  await completion
  assert.deepEqual(events, ["save"])
  completedAt = 1
  events.length = 0
  assert.equal(render("/twitch?tab=chat"), null)
  effects.forEach((effect) => effect())
  assert.deepEqual(events, ["/twitch?tab=chat"])
})
