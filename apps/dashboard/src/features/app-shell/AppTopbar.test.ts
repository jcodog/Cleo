import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"

type MockUserButtonProps = {
  children?: ReactNode
  showName?: boolean
}

type MockLinkProps = {
  href: string
  label: string
  labelIcon: ReactElement<{ "aria-hidden"?: boolean }>
}

const MockMenuItems = (_props: { children?: ReactNode }) => null
const MockLink = (_props: MockLinkProps) => null
const MockUserButton = Object.assign(
  (_props: MockUserButtonProps) => null,
  {
    Link: MockLink,
    MenuItems: MockMenuItems,
  }
)

test("staff UserButton composes Clerk menu navigation only when authorized", async (t) => {
  const runtimeGlobal = globalThis as typeof globalThis & {
    React?: typeof React
  }
  const previousReact = runtimeGlobal.React
  runtimeGlobal.React = React
  t.after(() => {
    if (previousReact === undefined) {
      Reflect.deleteProperty(runtimeGlobal, "React")
      return
    }

    runtimeGlobal.React = previousReact
  })

  t.mock.module("@clerk/nextjs", {
    exports: {
      UserButton: MockUserButton,
    },
  })

  const { StaffUserButton } = await import("./AppTopbar")

  const hidden = StaffUserButton({ staffLink: null }) as ReactElement<MockUserButtonProps>
  assert.equal(hidden.type, MockUserButton)
  assert.equal(hidden.props.showName, true)
  assert.equal(hidden.props.children, null)

  for (const expected of [
    {
      href: "/staff",
      icon: "shield-lock" as const,
      label: "Staff Dashboard" as const,
    },
    {
      href: "/dashboard",
      icon: "home" as const,
      label: "Cleo Dashboard" as const,
    },
  ]) {
    const rendered = StaffUserButton({ staffLink: expected }) as ReactElement<MockUserButtonProps>
    const menu = rendered.props.children
    assert.ok(isValidElement(menu))

    const menuElement = menu as ReactElement<{ children?: ReactNode }>
    assert.equal(menuElement.type, MockMenuItems)

    const child = menuElement.props.children
    assert.ok(isValidElement(child))

    const link = child as ReactElement<MockLinkProps>
    assert.equal(link.type, MockLink)
    assert.equal(link.props.href, expected.href)
    assert.equal(link.props.label, expected.label)
    assert.equal(link.props.labelIcon.props["aria-hidden"], true)
  }
})
