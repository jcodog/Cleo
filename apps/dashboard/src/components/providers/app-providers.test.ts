import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"

test("Clerk sign-out uses a local handoff and pending-request protection ends only after sign-out", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  const listeners = new Set<(event: BeforeUnloadEvent) => void>()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (
        name: string,
        listener: (event: BeforeUnloadEvent) => void
      ) => {
        assert.equal(name, "beforeunload")
        listeners.add(listener)
      },
      removeEventListener: (
        name: string,
        listener: (event: BeforeUnloadEvent) => void
      ) => {
        assert.equal(name, "beforeunload")
        listeners.delete(listener)
      },
    },
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
  })
  let effect: (() => void | (() => void)) | undefined
  t.mock.module("react", {
    exports: {
      ...React,
      useEffect: (callback: () => void | (() => void)) => {
        effect = callback
      },
    },
  })
  const clerk: { session: object | null | undefined } = { session: {} }
  const theme = { resolvedTheme: "dark" }
  let pending = false
  const client = { connectionState: () => ({ hasInflightRequests: pending }) }
  const ClerkProvider = () => null
  const ConvexProviderWithClerk = () => null
  t.mock.module("@clerk/nextjs", {
    exports: { ClerkProvider, useAuth: () => null, useClerk: () => clerk },
  })
  t.mock.module("convex/react-clerk", { exports: { ConvexProviderWithClerk } })
  t.mock.module(new URL("./theme-provider.tsx", import.meta.url).href, {
    exports: { useTheme: () => theme },
  })
  t.mock.module(new URL("../../lib/convexClient.ts", import.meta.url).href, {
    exports: { convexClient: client },
  })
  const { AppProviders, PendingRequestsGuard } = await import("./app-providers")
  for (const resolvedTheme of ["dark", "light"]) {
    theme.resolvedTheme = resolvedTheme
    const provider = AppProviders({ children: "product" })
    assert.equal(provider.type, ClerkProvider)
    assert.equal(provider.props.afterSignOutUrl, "/?s=sign-out")
    assert.equal(provider.props.children.type, ConvexProviderWithClerk)
    assert.equal(
      provider.props.children.props.children[0].type,
      PendingRequestsGuard
    )
    assert.equal(provider.props.children.props.children[1], "product")
    assert.equal(
      provider.props.appearance.theme.length,
      resolvedTheme === "dark" ? 2 : 1
    )
  }
  assert.equal(PendingRequestsGuard({ client }), null)
  assert.ok(effect)
  const cleanup = effect()
  assert.equal(listeners.size, 1)
  // The handler checks current Clerk state, even before React effects rerun.
  for (const session of [{}, null, undefined]) {
    clerk.session = session
    for (const hasPendingRequests of [false, true]) {
      pending = hasPendingRequests
      const event = new Event("beforeunload", { cancelable: true })
      for (const listener of listeners) listener(event as BeforeUnloadEvent)
      assert.equal(event.defaultPrevented, pending && Boolean(session))
    }
  }
  cleanup?.()
  assert.equal(listeners.size, 0)
})
