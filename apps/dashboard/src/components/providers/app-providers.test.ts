import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"

test("Clerk sign-out returns to in-scope sign-in without mounting a pending-request guard", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const theme = { resolvedTheme: "dark" }
  const client = { connectionState: () => ({ hasInflightRequests: true }) }
  const ClerkProvider = () => null
  const ConvexProviderWithClerk = () => null
  const useAuth = () => null
  t.mock.module("@clerk/nextjs", {
    exports: { ClerkProvider, useAuth },
  })
  t.mock.module("convex/react-clerk", { exports: { ConvexProviderWithClerk } })
  t.mock.module(new URL("./theme-provider.tsx", import.meta.url).href, {
    exports: { useTheme: () => theme },
  })
  t.mock.module(new URL("../../lib/convexClient.ts", import.meta.url).href, {
    exports: { convexClient: client },
  })
  const { AppProviders } = await import("./app-providers")
  for (const resolvedTheme of ["dark", "light"]) {
    theme.resolvedTheme = resolvedTheme
    const provider = AppProviders({ children: "product" })
    assert.equal(provider.type, ClerkProvider)
    assert.equal(provider.props.afterSignOutUrl, "/sign-in")
    assert.equal(
      new URL(provider.props.afterSignOutUrl, "https://app.cleoai.cloud")
        .origin,
      "https://app.cleoai.cloud"
    )
    assert.equal(provider.props.children.type, ConvexProviderWithClerk)
    assert.equal(provider.props.children.props.client, client)
    assert.equal(provider.props.children.props.useAuth, useAuth)
    assert.equal(provider.props.children.props.children, "product")
    assert.equal(
      provider.props.appearance.theme.length,
      resolvedTheme === "dark" ? 2 : 1
    )
  }
})
