import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"
import { isValidElement, type ReactNode } from "react"
import { getFunctionName } from "convex/server"

test("actual app layout starts authenticated preloads together and enforces onboarding with a safe return path", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  let completed = false
  let returnPath = "/twitch?tab=chat"
  const calls: string[] = []
  const resolveReads: (() => void)[] = []
  t.mock.module(new URL("../../lib/convex-auth.ts", import.meta.url).href, {
    exports: { getConvexAuthToken: async () => "convex-jwt" },
  })
  t.mock.module("convex/nextjs", {
    exports: {
      preloadQuery: async (
        query: Parameters<typeof getFunctionName>[0],
        _args: unknown,
        options: { token: string }
      ) => {
        assert.equal(options.token, "convex-jwt")
        calls.push(getFunctionName(query))
        await new Promise<void>((resolve) => resolveReads.push(resolve))
        return {
          value: {
            status: "ready",
            account: {
              onboardingCompletedAt: completed ? 1 : null,
              onboardingVersion: 1,
              onboardingProvenance: "post-rollout",
            },
          },
        }
      },
      preloadedQueryResult: (preload: { value: unknown }) => preload.value,
    },
  })
  t.mock.module("next/headers", {
    exports: {
      headers: async () => new Headers({ "x-cleo-return-path": returnPath }),
    },
  })
  t.mock.module("next/navigation", {
    exports: {
      redirect: (path: string) => {
        throw new Error(`redirect:${path}`)
      },
    },
  })
  const DashboardShellClient = () => null
  const OnboardingGuard = () => null
  t.mock.module(new URL("../app-shell/index.ts", import.meta.url).href, {
    exports: { DashboardShellClient },
  })
  t.mock.module(
    new URL("../onboarding/OnboardingGuard.tsx", import.meta.url).href,
    { exports: { OnboardingGuard } }
  )
  const { default: layout } = await import("../../app/(app)/layout")
  async function start() {
    calls.length = 0
    resolveReads.length = 0
    const rendering = layout({ children: "product content" })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(calls.length, 3, "all three queries start before any resolves")
    resolveReads.forEach((resolve) => resolve())
    return rendering
  }
  await assert.rejects(start(), {
    message: "redirect:/onboarding?returnTo=%2Ftwitch%3Ftab%3Dchat",
  })
  returnPath = "//evil.example"
  await assert.rejects(start(), { message: "redirect:/onboarding" })
  completed = true
  const tree = await start()
  assert.equal(tree.type, OnboardingGuard)
  assert.ok(
    isValidElement<{
      children: ReactNode
      preloadedStaffAccess: unknown
      preloadedManageableGuilds: unknown
    }>(tree.props.children)
  )
  assert.equal(tree.props.children.type, DashboardShellClient)
  assert.equal(tree.props.children.props.children, "product content")
  assert.ok(tree.props.children.props.preloadedStaffAccess)
  assert.ok(tree.props.children.props.preloadedManageableGuilds)
})
