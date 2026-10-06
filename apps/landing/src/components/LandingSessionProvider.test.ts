import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"

test("landing Clerk provider receives only the public key and cross-app auth URLs", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const ClerkProvider = () => null
  t.mock.module("@clerk/nextjs", { exports: { ClerkProvider } })
  const { LandingSessionProvider } = await import("./LandingSessionProvider")
  for (const origin of [
    "https://app.example",
    "https://preview-app.vercel.app",
    "https://localhost:3000",
  ]) {
    const provider = LandingSessionProvider({
      origin,
      publishableKey: "pk_test_public",
      children: "marketing",
    })
    assert.equal(provider.type, ClerkProvider)
    assert.deepEqual(provider.props, {
      publishableKey: "pk_test_public",
      signInUrl: `${origin}/sign-in`,
      signUpUrl: `${origin}/sign-up`,
      children: "marketing",
    })
  }
  for (const publishableKey of [undefined, ""]) {
    assert.throws(
      () =>
        LandingSessionProvider({
          origin: "https://app.example",
          publishableKey,
          children: null,
        }),
      /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be set/
    )
  }
})
