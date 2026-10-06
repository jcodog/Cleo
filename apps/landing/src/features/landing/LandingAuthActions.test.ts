import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"
import { Children, isValidElement, type ReactNode } from "react"
import { LandingAuthActions } from "./LandingAuthActions"

function links(node: ReactNode): string[] {
  if (!isValidElement<{ children?: ReactNode; href?: string }>(node)) return []
  return [
    ...(node.props.href ? [node.props.href] : []),
    ...Children.toArray(node.props.children).flatMap(links),
  ]
}

test("rendered landing CTAs point every placement at the configured authenticated app", (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  for (const origin of [
    "https://app.cleoai.cloud",
    "https://app-preview.vercel.app",
    "https://localhost:3000",
  ]) {
    assert.deepEqual(
      links(LandingAuthActions({ origin, placement: "navigation" })),
      [`${origin}/sign-in`, `${origin}/sign-up`]
    )
    assert.deepEqual(links(LandingAuthActions({ origin, placement: "hero" })), [
      `${origin}/sign-up`,
      `${origin}/sign-in`,
    ])
    assert.deepEqual(
      links(LandingAuthActions({ origin, placement: "footer" })),
      [`${origin}/sign-in`]
    )
  }
})
