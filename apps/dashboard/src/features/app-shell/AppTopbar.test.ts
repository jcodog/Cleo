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
type MockActionProps =
  | { label: "manageAccount" }
  | {
      label: "Sign out"
      labelIcon: ReactElement<{ "aria-hidden"?: boolean }>
      onClick: () => void
    }

const MockAction = (_props: MockActionProps) => null
const MockUserButton = Object.assign(
  (_props: MockUserButtonProps) => null,
  {
    Action: MockAction,
    Link: MockLink,
    MenuItems: MockMenuItems,
  }
)

function assertManageAccount(item: ReactNode) {
  assert.ok(isValidElement<MockActionProps>(item))
  assert.equal(item.type, MockAction)
  assert.deepEqual(item.props, { label: "manageAccount" })
}

function assertSignOut(item: ReactNode) {
  assert.ok(isValidElement<MockActionProps>(item))
  assert.equal(item.type, MockAction)
  assert.ok(item.props.label === "Sign out")
  assert.equal(item.props.labelIcon.props["aria-hidden"], true)
  assert.equal(typeof item.props.onClick, "function")
}

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
  assert.equal(hiddenMenu.type, MockMenuItems)
  const hiddenItems = React.Children.toArray(
    (hiddenMenu as ReactElement<{ children?: ReactNode }>).props.children
  )
  assert.equal(hiddenItems.length, 2)
  assertManageAccount(hiddenItems[0])
  assertSignOut(hiddenItems[1])

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
    assert.equal(children.length, 3)

    const link = children[0] as ReactElement<MockLinkProps>
    assert.equal(link.type, MockLink)
    assert.equal(link.props.href, expected.href)
    assert.equal(link.props.label, expected.label)
    assert.equal(link.props.labelIcon.props["aria-hidden"], true)

    assertManageAccount(children[1])
    assertSignOut(children[2])
  }
})
