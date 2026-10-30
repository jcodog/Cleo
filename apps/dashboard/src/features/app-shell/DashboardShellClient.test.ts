import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { AppShellProps } from "./types"
import { AppSidebarNav } from "./AppSidebarNav"
import { api } from "@workspace/backend/convex/_generated/api.js"

test("Twitch shell renders account settings navigation through the shared sidebar", async (t) => {
  let pathname = "/twitch"
  let storedGuildId: string | undefined
  let userId: string | undefined = "user"
  let selectionClerkUserId = "user"
  let directory:
    | {
        clerkUserId: string
        status: string
        guilds: {
          discordGuildId: string
          lastOpenedAt?: number
          verified: boolean
        }[]
      }
    | undefined
  const effects: (() => void)[] = []
  const writes: (string | undefined)[] = []
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
      useEffect: (effect: () => void) => effects.push(effect),
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: { useAuth: () => ({ sessionId: "session", userId }) },
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
      useQuery: () => directory,
    },
  })
  t.mock.module("./AppShell.tsx", { exports: { AppShell: "AppShell" } })
  t.mock.module("../../components/stores/app-shell-store.ts", {
    exports: {
      useAppShellStore: (
        select: (state: {
          selectionClerkUserId: string
          selectedDiscordGuildId: string | undefined
          setSelectedDiscordGuildId: (
            id: string | undefined,
            owner: string
          ) => void
        }) => unknown
      ) =>
        select({
          selectionClerkUserId,
          selectedDiscordGuildId: storedGuildId,
          setSelectedDiscordGuildId: (id, owner) => {
            writes.push(id)
            storedGuildId = id
            selectionClerkUserId = owner
          },
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
  assert.equal(items.length, 4)
  assert.equal(items[3]?.href, "/twitch/moderation")
  assert.deepEqual(
    props.footerNavSections
      ?.flatMap((section) => section.items)
      .map((item) => item.href),
    ["/account"]
  )
  assert.equal(items[0]?.title, "Overview")
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
  assert.equal(label?.props.children, "Overview")
  pathname = "/twitch/link/callback"
  assert.equal(shell().navSections[0]?.items[0]?.isActive, false)
  pathname = "/account/billing"
  const account = shell()
  assert.equal(account.showPlatformSelector, false)
  assert.equal(account.showDiscordGuildSelect, false)
  assert.deepEqual(account.navSections.flatMap(section => section.items).map(item => item.href), ["/account", "/account/connections", "/account/security", "/account/billing"])
  assert.equal(account.navSections.flatMap(section => section.items).find(item => item.href === "/account/billing")?.isActive, true)
  // Routes remain stable during a temporary Discord membership verification gap.
  pathname = "/dashboard/999999999999999999"
  assert.ok(
    shell().navSections[0]?.items.some((item) => item.title === "Premium Guild")
  )
  pathname = "/dashboard"
  assert.ok((shell().navSections[0]?.items.length ?? 0) > 0)
  pathname = "/dashboard/servers"
  assert.deepEqual(
    shell().navSections[0]?.items.map((item) => item.title),
    ["Servers"]
  )
  await t.test(
    "stored guild survives directory loading and verification gaps until fresh reconciliation",
    () => {
      effects.length = 0
      storedGuildId = "222222222222222222"
      const settle = () => {
        shell()
        effects.splice(0).forEach((effect) => effect())
      }
      settle()
      for (const status of ["pending", "unavailable", "expired"]) {
        directory = { clerkUserId: "user", status, guilds: [] }
        settle()
        assert.equal(storedGuildId, "222222222222222222", status)
      }
      assert.deepEqual(writes, [])
      directory = {
        clerkUserId: "user",
        status: "ready",
        guilds: [
          {
            discordGuildId: "111111111111111111",
            lastOpenedAt: 100,
            verified: true,
          },
          {
            discordGuildId: "222222222222222222",
            lastOpenedAt: 10,
            verified: true,
          },
        ],
      }
      settle()
      assert.equal(storedGuildId, "222222222222222222")
      assert.deepEqual(writes, [])
      directory = { clerkUserId: "user", status: "ready", guilds: [] }
      settle()
      assert.equal(storedGuildId, undefined)
      assert.deepEqual(writes, [undefined])
      directory = undefined
      storedGuildId = "222222222222222222"
      userId = undefined
      settle()
      assert.equal(
        storedGuildId,
        "222222222222222222",
        "unfinished Clerk hydration preserves selection"
      )
      userId = "second-account"
      settle()
      assert.equal(storedGuildId, undefined)
      assert.equal(selectionClerkUserId, "second-account")
    }
  )
})
