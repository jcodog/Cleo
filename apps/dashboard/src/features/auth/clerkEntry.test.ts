import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"
import { isValidElement, type ReactNode } from "react"
import { NextRequest } from "next/server"

test("actual Clerk entry bridges protected deep links across sign-in and sign-up without external redirects", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const SignIn = () => null
  const SignUp = () => null
  t.mock.module("@clerk/nextjs", { exports: { SignIn, SignUp } })
  t.mock.module("@clerk/nextjs/server", {
    exports: { clerkMiddleware: (handler: unknown) => handler },
  })
  t.mock.module(new URL("./AuthShell.tsx", import.meta.url).href, {
    exports: { AuthShell: () => null },
  })
  const { default: signIn } =
    await import("../../app/(auth)/sign-in/[[...sign-in]]/page")
  const { default: signUp } =
    await import("../../app/(auth)/sign-up/[[...sign-up]]/page")
  const { default: proxy } = await import("../../proxy")
  const handler = proxy as unknown as (
    auth: () => Promise<{ userId: null }>,
    request: NextRequest
  ) => Promise<Response>
  function clerkProps(node: ReactNode) {
    assert.ok(isValidElement<{ children: ReactNode }>(node))
    const clerk = node.props.children
    assert.ok(
      isValidElement<{
        forceRedirectUrl: string
        signUpForceRedirectUrl?: string
        signInForceRedirectUrl?: string
        signUpUrl?: string
        signInUrl?: string
        oauthFlow?: "auto" | "popup" | "redirect"
      }>(clerk)
    )
    assert.ok(clerk.type === SignIn || clerk.type === SignUp)
    // Keep Clerk's supported auto selection until installed-device testing
    // demonstrates a need for a different flow on either mobile platform.
    assert.equal(clerk.props.oauthFlow, undefined)
    return clerk.props
  }
  for (const path of [
    "/twitch?tab=chat",
    "/dashboard/123/logs?tab=a%26b&tab=roles",
    "/staff/support-tickets",
    "/kick",
    "/account",
    "/settings",
    "/billing",
    "/subscription",
  ]) {
    const response = await handler(
      async () => ({ userId: null }),
      new NextRequest(`https://app.cleoai.cloud${path}`)
    )
    const location = new URL(response.headers.get("location") ?? "")
    const props = clerkProps(
      await signIn({
        searchParams: Promise.resolve({
          returnTo: location.searchParams.get("returnTo") ?? undefined,
        }),
      })
    )
    assert.equal(props.forceRedirectUrl, path)
    assert.equal(props.signUpForceRedirectUrl, path)
    const transfer = new URL(props.signUpUrl ?? "", location)
    const upProps = clerkProps(
      await signUp({
        searchParams: Promise.resolve({
          returnTo: transfer.searchParams.get("returnTo") ?? undefined,
        }),
      })
    )
    assert.equal(upProps.forceRedirectUrl, path)
    assert.equal(upProps.signInForceRedirectUrl, path)
    assert.equal(
      new URL(upProps.signInUrl ?? "", location).searchParams.get("returnTo"),
      path
    )
  }
  for (const returnTo of [
    undefined,
    "https://evil.example",
    "//evil.example",
    "/%2f%2fevil.example",
    "/sign-in",
    "/onboarding",
    "/pricing",
    ["/twitch", "/staff"],
  ]) {
    const props = clerkProps(
      await signIn({
        searchParams: Promise.resolve({
          returnTo,
          redirect_url: "https://evil.example",
        }),
      })
    )
    assert.equal(props.forceRedirectUrl, "/")
    assert.equal(props.signUpForceRedirectUrl, "/onboarding")
    assert.equal(props.signUpUrl, "/sign-up")
    const upProps = clerkProps(
      await signUp({
        searchParams: Promise.resolve({
          returnTo,
          redirect_url: "https://evil.example",
        }),
      })
    )
    assert.equal(upProps.forceRedirectUrl, "/onboarding")
    assert.equal(upProps.signInForceRedirectUrl, "/")
    assert.equal(upProps.signInUrl, "/sign-in")
  }
})
