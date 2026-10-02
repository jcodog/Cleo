import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { AppShellProps } from "./types"
import { AppSidebarNav } from "./AppSidebarNav"
import { api } from "@workspace/backend/convex/_generated/api.js"

test("Twitch shell renders account settings navigation through the shared sidebar", async (t) => {
  let pathname = "/twitch"
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "React", previous)
    else Reflect.deleteProperty(globalThis, "React")
  })
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (value: unknown) => [value, () => {}],
      useEffect: () => {},
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: { useAuth: () => ({ sessionId: "session" }) },
  })
  t.mock.module("next/navigation", {
    exports: {
      usePathname: () => pathname,
      redirect: () => assert.fail("Unexpected redirect"),
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
      usePreloadedQuery: () => [],
    },
  })
  t.mock.module("./AppShell.tsx", { exports: { AppShell: "AppShell" } })
  t.mock.module("../../components/stores/app-shell-store.ts", {
    exports: {
      useAppShellStore: (
        select: (state: {
          selectedDiscordGuildId: undefined
          setSelectedDiscordGuildId: () => void
        }) => unknown
      ) =>
        select({
          selectedDiscordGuildId: undefined,
          setSelectedDiscordGuildId: () => {},
        }),
    },
  })
  const { DashboardShellClient } = await import("./DashboardShellClient")
  const shell = () => {
    const element = DashboardShellClient({
      children: null,
      preloadedManageableGuilds: {
        __type: api.queries.dashboard.discord.guilds.manageable.list,
        _name: "test",
        _argsJSON: "{}",
        _valueJSON: "[]",
      },
      preloadedStaffAccess: {
        __type: api.queries.dashboard.staff.access.get,
        _name: "test",
        _argsJSON: "{}",
        _valueJSON: "null",
      },
    })
    assert.ok(React.isValidElement<AppShellProps>(element))
    return element.props
  }
  const props = shell()
  assert.equal(props.showPlatformSelector, true)
  assert.equal(props.showDiscordGuildSelect, false)
  assert.equal(props.navSections.length, 1)
  assert.equal(props.navSections[0]?.title, "Twitch account")
  const items = props.navSections.flatMap((section) => section.items)
  assert.equal(items.length, 1)
  assert.equal(items[0]?.title, "Twitch settings")
  assert.equal(items[0]?.href, "/twitch")
  assert.equal(items[0]?.isActive, true)
  assert.ok(items[0]?.icon)
  assert.equal(items[0]?.disabled, undefined)
  const rendered = AppSidebarNav({ navSections: props.navSections })
  type NavProps = {
    children?: React.ReactNode
    render?: React.ReactNode
    isActive?: boolean
  }
  function elements(node: React.ReactNode): React.ReactElement<NavProps>[] {
    if (!React.isValidElement<NavProps>(node)) return []
    return [
      node,
      ...React.Children.toArray(node.props.children).flatMap(elements),
    ]
  }
  const active = elements(rendered).find((element) => element.props.isActive)
  assert.ok(active)
  assert.ok(React.isValidElement<{ href: string }>(active.props.render))
  assert.equal(active.props.render.props.href, "/twitch")
  const label = elements(active).find((element) => element.type === "span")
  assert.equal(label?.props.children, "Twitch settings")
  pathname = "/twitch/link/callback"
  assert.equal(shell().navSections[0]?.items[0]?.isActive, false)
})
