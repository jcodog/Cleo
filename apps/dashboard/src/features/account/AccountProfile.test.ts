import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"

test("hosted account has one Clerk navigation with native pages and routed application pages", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() =>
    previous
      ? Object.defineProperty(globalThis, "React", previous)
      : Reflect.deleteProperty(globalThis, "React")
  )
  const Page = () => null
  const ProfileLink = () => null
  const UserProfile = Object.assign(() => null, { Page, Link: ProfileLink })
  t.mock.module("@clerk/nextjs", {
    exports: {
      UserProfile,
      useAuth: () => ({}),
      useUser: () => ({}),
      useReverification: () => ({}),
    },
  })
  const { AccountProfile } = await import("./AccountProfile")
  const tree = AccountProfile()
  const profile = tree.props.children
  assert.equal(profile.type, UserProfile)
  assert.equal(profile.props.routing, "path")
  assert.equal(profile.props.path, "/account")
  assert.equal(profile.props.appearance.elements.navbar, undefined)
  assert.equal(
    profile.props.appearance.elements.profileSection__connectedAccounts,
    undefined
  )
  const pages = React.Children.toArray(
    profile.props.children
  ) as React.ReactElement<{
    label: string
    url?: string
    children?: React.ReactNode
  }>[]
  assert.deepEqual(
    pages.map((page) => [page.props.label, page.props.url]),
    [
      ["account", undefined],
      ["security", undefined],
      ["Connected accounts", "connections"],
      ["Billing & subscriptions", "/billing"],
    ]
  )
  assert.ok(pages.slice(0, 3).every((page) => page.type === Page))
  assert.equal(pages[3]?.type, ProfileLink)
  assert.ok(pages[2]?.props.children)
  assert.equal(pages[3]?.props.children, undefined)
})
