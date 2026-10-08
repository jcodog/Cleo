import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { AppShellProps } from "./types"

test("actual dashboard navigation uses in-scope Next links without new-window targets", async (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, "React", previousReact)
    else Reflect.deleteProperty(globalThis, "React")
  })
  let pathname = "/dashboard/123"
  t.mock.module("react", {
    exports: {
      ...React,
      useEffect: () => undefined,
      useState: <T>(initial: T) => [initial, () => undefined],
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: { useAuth: () => ({ sessionId: "session_123" }) },
  })
  t.mock.module("next/navigation", {
    exports: {
      usePathname: () => pathname,
      redirect: (path: string) => {
        throw new Error(`redirect:${path}`)
      },
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
      usePreloadedQuery: (query: { _name: string }) =>
        query._name === "guilds"
          ? [{ discordGuildId: "123" }]
          : { status: "ready" },
    },
  })
  t.mock.module(
    new URL("../../components/stores/app-shell-store.ts", import.meta.url).href,
    {
      exports: { useAppShellStore: () => undefined },
    }
  )
  const AppShell = () => null
  t.mock.module(new URL("./AppShell.tsx", import.meta.url).href, {
    exports: { AppShell },
  })
  t.mock.module("@workspace/ui/components/sidebar", {
    exports: Object.fromEntries(
      [
        "SidebarGroup",
        "SidebarGroupContent",
        "SidebarGroupLabel",
        "SidebarMenu",
        "SidebarMenuButton",
        "SidebarMenuItem",
      ].map((name) => [name, () => null])
    ),
  })
  const { DashboardShellClient } = await import("./DashboardShellClient")
  const { AppSidebarNav } = await import("./AppSidebarNav")
  const { default: Link } = await import("next/link")
  /** Collects rendered Next links, including links passed through primitive render props. */
  function links(
    node: React.ReactNode
  ): React.ReactElement<{ href: string; target?: string }>[] {
    if (
      !React.isValidElement<{
        children?: React.ReactNode
        render?: React.ReactNode
      }>(node)
    )
      return []
    if (node.type === Link) {
      assert.ok(React.isValidElement<{ href: string; target?: string }>(node))
      return [node]
    }
    return [
      ...React.Children.toArray(node.props.children).flatMap(links),
      ...links(node.props.render),
    ]
  }
  for (const path of ["/dashboard/123", "/twitch", "/kick", "/staff"]) {
    pathname = path
    const shell = DashboardShellClient({
      children: null,
      preloadedManageableGuilds: {
        __type: api.queries.dashboard.discord.guilds.manageable.list,
        _name: "guilds",
        _argsJSON: "{}",
        _valueJSON: "[]",
      },
      preloadedStaffAccess: {
        __type: api.queries.dashboard.staff.access.get,
        _name: "staff",
        _argsJSON: "{}",
        _valueJSON: "{}",
      },
    })
    assert.ok(React.isValidElement<AppShellProps>(shell))
    assert.equal(shell.type, AppShell)
    const renderedLinks = links(
      AppSidebarNav({ navSections: shell.props.navSections })
    )
    assert.equal(
      renderedLinks.length,
      shell.props.navSections.flatMap((section) =>
        section.items.filter((item) => !item.disabled)
      ).length
    )
    for (const link of renderedLinks) {
      assert.ok(link.props.href.startsWith("/"))
      assert.equal(
        new URL(link.props.href, "https://app.cleoai.cloud").origin,
        "https://app.cleoai.cloud"
      )
      assert.equal(link.props.target, undefined)
    }
  }
})
