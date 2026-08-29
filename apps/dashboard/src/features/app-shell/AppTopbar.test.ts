import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"

type MockUserButtonProps = {
  appearance?: {
    elements?: Record<string, unknown>
  }
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
const MockAction = (_props: {
  label: string
  labelIcon: ReactElement<{ "aria-hidden"?: boolean }>
  onClick: () => void
}) => null
const MockUserButton = Object.assign(
  (_props: MockUserButtonProps) => null,
  {
    Action: MockAction,
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
      useClerk: () => ({ signOut: async () => undefined }),
    },
  })

  const { StaffUserButton } = await import("./AppTopbar")

  const hidden = StaffUserButton({ staffLink: null }) as ReactElement<MockUserButtonProps>
  assert.equal(hidden.type, MockUserButton)
  assert.equal(hidden.props.showName, true)
  assert.deepEqual(hidden.props.appearance?.elements, {
    userButtonPopoverActionButton__signOut: { display: "none" },
  })

  const hiddenMenu = hidden.props.children
  assert.ok(isValidElement(hiddenMenu))
  const hiddenItems = React.Children.toArray(
    (hiddenMenu as ReactElement<{ children?: ReactNode }>).props.children
  )
  assert.equal(hiddenItems.length, 1)
  assert.equal((hiddenItems[0] as ReactElement).type, MockAction)

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

    const children = React.Children.toArray(menuElement.props.children)
    assert.equal(children.length, 2)

    const link = children[0] as ReactElement<MockLinkProps>
    assert.equal(link.type, MockLink)
    assert.equal(link.props.href, expected.href)
    assert.equal(link.props.label, expected.label)
    assert.equal(link.props.labelIcon.props["aria-hidden"], true)

    const signOut = children[1] as ReactElement<{
      label: string
      labelIcon: ReactElement<{ "aria-hidden"?: boolean }>
    }>
    assert.equal(signOut.type, MockAction)
    assert.equal(signOut.props.label, "Sign out")
    assert.equal(signOut.props.labelIcon.props["aria-hidden"], true)
  }
})
