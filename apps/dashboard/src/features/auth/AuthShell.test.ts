import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"
import { Children, isValidElement, type ReactNode } from "react"

test("auth shell public links use the site origin locally and reject missing deployment configuration", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const values = {
    NEXT_PUBLIC_SITE_URL: "https://site-preview.vercel.app",
    VERCEL_ENV: "preview",
    VERCEL_URL: "app-preview.vercel.app",
  }
  t.mock.module("@workspace/env/dashboard", {
    exports: { dashboardEnv: values },
  })
  t.mock.module(
    new URL("../../components/backgrounds/DotGrid.tsx", import.meta.url).href,
    { exports: { DotGrid: () => null } }
  )
  const { AuthShell } = await import("./AuthShell")
  function links(node: ReactNode): string[] {
    if (!isValidElement<{ children?: ReactNode; href?: string }>(node))
      return []
    return [
      ...(node.props.href ? [node.props.href] : []),
      ...Children.toArray(node.props.children).flatMap(links),
    ]
  }
  assert.deepEqual(links(AuthShell({ children: null })), [
    values.NEXT_PUBLIC_SITE_URL,
    values.NEXT_PUBLIC_SITE_URL,
  ])
  values.NEXT_PUBLIC_SITE_URL = ""
  assert.throws(
    () => AuthShell({ children: null }),
    /NEXT_PUBLIC_SITE_URL must be configured/
  )
  values.VERCEL_ENV = "production"
  assert.throws(
    () => AuthShell({ children: null }),
    /NEXT_PUBLIC_SITE_URL must be configured/
  )
  values.VERCEL_ENV = ""
  values.VERCEL_URL = ""
  assert.deepEqual(links(AuthShell({ children: null })), [
    "http://localhost:3001",
    "http://localhost:3001",
  ])
})
