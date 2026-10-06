import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"
import { Children, isValidElement, type ReactNode } from "react"

function text(node: ReactNode): string {
  if (typeof node === "string") return node
  if (!isValidElement<{ children?: ReactNode }>(node)) return ""
  return Children.toArray(node.props.children).map(text).join("")
}

function links(node: ReactNode): { href: string; label: string }[] {
  if (!isValidElement<{ children?: ReactNode; href?: string }>(node)) return []
  if (node.props.href) return [{ href: node.props.href, label: text(node) }]
  return Children.toArray(node.props.children).flatMap(links)
}

test("landing CTAs follow the loaded Clerk session and configured application origin", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const session = { isLoaded: false, isSignedIn: false }
  t.mock.module("@clerk/nextjs", { exports: { useAuth: () => session } })
  const { LandingAuthActions } = await import("./LandingAuthActions")
  const placements = ["navigation", "hero", "footer"] as const

  for (const isSignedIn of [false, true]) {
    session.isSignedIn = isSignedIn
    session.isLoaded = false
    for (const placement of placements) {
      const placeholder = LandingAuthActions({
        origin: "https://app.example",
        placement,
      })
      assert.deepEqual(links(placeholder), [])
      assert.equal(text(placeholder), "")
      assert.equal(placeholder.props["aria-hidden"], true)
      assert.match(placeholder.props.className, /invisible h-(5|8|11) w-/)
    }
    session.isLoaded = true
    for (const origin of [
      "https://app.cleoai.cloud",
      "https://paired-app.vercel.app",
      "https://localhost:3000",
    ]) {
      const signIn = { href: `${origin}/sign-in`, label: "Sign in" }
      const getStarted = { href: `${origin}/sign-up`, label: "Get started" }
      const dashboard = { href: `${origin}/dashboard`, label: "Open dashboard" }
      assert.deepEqual(
        links(LandingAuthActions({ origin, placement: "navigation" })),
        isSignedIn ? [dashboard] : [signIn, getStarted]
      )
      assert.deepEqual(
        links(LandingAuthActions({ origin, placement: "hero" })),
        isSignedIn
          ? [dashboard, { href: "#product", label: "Explore product" }]
          : [getStarted, signIn]
      )
      assert.deepEqual(
        links(LandingAuthActions({ origin, placement: "footer" })),
        isSignedIn ? [dashboard] : [signIn]
      )
    }
  }
})
