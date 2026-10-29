import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
type Props = {
  children?: React.ReactNode
  onPress?: () => Promise<void>
  accessibilityLabel?: string
  tokenCache?: unknown
}
function nodes(value: React.ReactNode): React.ReactElement<Props>[] {
  if (!React.isValidElement<Props>(value)) return []
  return [value, ...React.Children.toArray(value.props.children).flatMap(nodes)]
}
test("native screen restores auth, activates Discord sign-in, shows servers only after backend auth and clears on sign-out", async (t) => {
  let loaded = false,
    signedIn = false,
    authenticated = false,
    loading = true,
    signedOut = 0,
    activated = ""
  const cache = {
    getToken: async () => "secure-session",
    saveToken: async () => {},
    clearToken: async () => {},
  }
  const auth = () => ({
    isLoaded: loaded,
    isSignedIn: signedIn,
    sessionId: "session",
  })
  t.mock.module("react", {
    exports: { ...React, useState: (value: unknown) => [value, () => {}] },
  })
  t.mock.module("react-native", {
    exports: {
      View: "View",
      Text: "Text",
      ActivityIndicator: "Loading",
      Pressable: "Button",
      StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
    },
  })
  t.mock.module("react-native-safe-area-context", {
    exports: { SafeAreaView: "SafeArea" },
  })
  t.mock.module("../components/NativeGlass.tsx", {
    exports: { NativeGlass: "NativeGlass" },
  })
  t.mock.module("expo-symbols", { exports: { SymbolView: "SymbolView" } })
  t.mock.module("@clerk/expo", {
    exports: {
      ClerkProvider: "ClerkProvider",
      useAuth: auth,
      useClerk: () => ({
        signOut: async () => {
          signedOut++
          signedIn = false
        },
      }),
      useSSO: () => ({
        startSSOFlow: async (args: { strategy: string }) => {
          assert.equal(args.strategy, "oauth_discord")
          return {
            createdSessionId: "new-session",
            setActive: async ({ session }: { session: string }) => {
              activated = session
              signedIn = true
            },
          }
        },
      }),
    },
  })
  t.mock.module("@clerk/expo/token-cache", { exports: { tokenCache: cache } })
  t.mock.module("convex/react", {
    exports: {
      useConvexAuth: () => ({
        isLoading: loading,
        isAuthenticated: authenticated,
      }),
      ConvexReactClient: class {},
    },
  })
  t.mock.module("convex/react-clerk", {
    exports: { ConvexProviderWithClerk: "ConvexProvider" },
  })
  t.mock.module("expo-router", { exports: { Stack: "Stack" } })
  t.mock.module("expo-status-bar", { exports: { StatusBar: "StatusBar" } })
  t.mock.module("expo-web-browser", {
    exports: { maybeCompleteAuthSession: () => {} },
  })
  t.mock.module("expo-auth-session", {
    exports: { makeRedirectUri: () => "cleo://sso-callback" },
  })
  t.mock.module("../servers/Servers.tsx", { exports: { Servers: "Servers" } })
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const { default: Home } = await import("../app/index")
  const render = () => nodes(Home())
  assert.ok(render().some((node) => node.type === "Loading"))
  assert.ok(!render().some((node) => node.type === "Servers"))
  loaded = true
  loading = false
  const signIn = render().find((node) => node.type === "Button")
  assert.ok(signIn)
  await signIn.props.onPress?.()
  assert.equal(activated, "new-session")
  assert.ok(!render().some((node) => node.type === "Servers"))
  authenticated = true
  assert.ok(render().some((node) => node.type === "Servers"))
  const signOut = render().find(
    (node) => node.props.accessibilityLabel === "Sign out"
  )
  assert.ok(signOut)
  await signOut.props.onPress?.()
  assert.equal(signedOut, 1)
  assert.ok(!render().some((node) => node.type === "Servers"))
  const previousKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    previousUrl = process.env.EXPO_PUBLIC_CONVEX_URL
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_fixture"
  process.env.EXPO_PUBLIC_CONVEX_URL = "https://fixture.convex.cloud"
  t.after(() => {
    if (previousKey === undefined)
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = previousKey
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_CONVEX_URL
    else process.env.EXPO_PUBLIC_CONVEX_URL = previousUrl
  })
  const { default: Root } = await import("../app/_layout")
  const root = Root()
  assert.equal(root.type, "ClerkProvider")
  assert.equal(
    root.props.tokenCache,
    cache,
    "Clerk owns the secure persistent cache"
  )
})
