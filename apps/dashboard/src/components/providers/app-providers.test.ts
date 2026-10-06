import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"

test("dashboard Clerk sign-out returns to the configured public site in every environment", async (t) => {
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
  const client = { convexClient: {} as object | undefined }
  const ClerkProvider = () => null
  const ConvexProviderWithClerk = () => null
  t.mock.module("@clerk/nextjs", {
    exports: { ClerkProvider, useAuth: () => null },
  })
  t.mock.module("convex/react-clerk", { exports: { ConvexProviderWithClerk } })
  t.mock.module(new URL("./theme-provider.tsx", import.meta.url).href, {
    exports: { useTheme: () => theme },
  })
  t.mock.module(new URL("../../lib/convexClient.ts", import.meta.url).href, {
    exports: client,
  })
  const { AppProviders } = await import("./app-providers")
  for (const site of [
    "https://cleoai.cloud",
    "https://landing-preview.vercel.app",
    "http://localhost:3001",
  ]) {
    for (const resolvedTheme of ["dark", "light"]) {
      theme.resolvedTheme = resolvedTheme
      const provider = AppProviders({ children: "product", siteOrigin: site })
      assert.equal(provider.type, ClerkProvider)
      assert.equal(provider.props.afterSignOutUrl, site)
      assert.equal(provider.props.children.type, ConvexProviderWithClerk)
      assert.equal(provider.props.children.props.children, "product")
      assert.equal(
        provider.props.appearance.theme.length,
        resolvedTheme === "dark" ? 2 : 1
      )
    }
  }
})
