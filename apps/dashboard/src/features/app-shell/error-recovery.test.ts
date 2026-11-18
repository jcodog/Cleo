import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { BackendBoundary } from "./BackendBoundary"

function elements(
  node: React.ReactNode
): React.ReactElement<{
  children?: React.ReactNode
  onClick?: () => void
  role?: string
}>[] {
  return React.Children.toArray(node).flatMap((child) =>
    React.isValidElement<{
      children?: React.ReactNode
      onClick?: () => void
      role?: string
    }>(child)
      ? [child, ...elements(child.props.children)]
      : []
  )
}

test("backend Retry clears the failed state and renders the original children", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  try {
    const boundary = new BackendBoundary({
      children: "restored content",
      feature: "Billing",
    })
    boundary.state = BackendBoundary.getDerivedStateFromError(
      new Error("failure")
    )
    boundary.setState = (update) => {
      if (update && typeof update === "object")
        Object.assign(boundary.state, update)
    }
    const retry = elements(boundary.render()).find(
      (node) => node.props.children === "Retry"
    )
    assert.ok(retry?.props.onClick)
    retry.props.onClick()
    assert.equal(boundary.render(), "restored content")
  } finally {
    if (previous) Object.defineProperty(globalThis, "React", previous)
    else Reflect.deleteProperty(globalThis, "React")
  }
})

test("account error renders an alert and its Retry account button invokes reset", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  try {
    const { default: AccountError } =
      await import("../../app/(app)/account/error")
    let resets = 0
    const nodes = elements(
      AccountError({
        reset: () => {
          resets++
        },
      })
    )
    assert.ok(nodes.some((node) => node.props.role === "alert"))
    const retry = nodes.find((node) => node.props.children === "Retry account")
    assert.ok(retry?.props.onClick)
    retry.props.onClick()
    assert.equal(resets, 1)
  } finally {
    if (previous) Object.defineProperty(globalThis, "React", previous)
    else Reflect.deleteProperty(globalThis, "React")
  }
})

test("the old Linked Roles bookmark redirects to the server directory", async (t) => {
  let protectedRequests = 0
  t.mock.module("@clerk/nextjs/server", {
    exports: {
      auth: {
        protect: async () => {
          protectedRequests++
        },
      },
    },
  })
  t.mock.module("next/navigation", {
    exports: {
      redirect: (path: string) => {
        throw new Error(`redirect:${path}`)
      },
    },
  })
  const { default: RolesPage } =
    await import("../../app/(app)/account/roles/page")
  await assert.rejects(RolesPage(), /redirect:\/dashboard\/servers/)
  assert.equal(protectedRequests, 1)
})
