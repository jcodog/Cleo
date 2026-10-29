import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"

test("dashboard entry scopes saved selection and waits for authoritative verification", async (t) => {
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
  let userId = "alice"
  let authenticated = true
  const directory = {
    clerkUserId: "alice",
    status: "ready",
    guilds: [
      {
        discordGuildId: "111111111111111111",
        verified: true,
        lastOpenedAt: 10,
      },
      {
        discordGuildId: "222222222222222222",
        verified: true,
        lastOpenedAt: 20,
      },
    ],
  }
  const state = {
    selectionClerkUserId: "alice",
    selectedDiscordGuildId: "111111111111111111",
  }
  const effects: (() => void)[] = []
  const paths: string[] = []
  t.mock.module("react", {
    exports: {
      ...React,
      useEffect: (effect: () => void) => effects.push(effect),
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: { useAuth: () => ({ userId, isLoaded: true }) },
  })
  t.mock.module("convex/react", {
    exports: {
      useConvexAuth: () => ({
        isAuthenticated: authenticated,
        isLoading: false,
      }),
      useQuery: () => directory,
    },
  })
  t.mock.module("next/navigation", {
    exports: {
      useRouter: () => ({ replace: (path: string) => paths.push(path) }),
    },
  })
  t.mock.module("../../components/stores/app-shell-store.ts", {
    exports: {
      useAppShellStore: (select: (value: typeof state) => unknown) =>
        select(state),
    },
  })
  const { DashboardEntry } = await import("./DashboardEntry")
  const settle = () => {
    paths.length = 0
    DashboardEntry()
    effects.splice(0).forEach((effect) => effect())
    return [...paths]
  }
  assert.deepEqual(settle(), ["/dashboard/111111111111111111"])
  state.selectedDiscordGuildId = "999999999999999999"
  assert.deepEqual(settle(), ["/dashboard/222222222222222222"])
  for (const status of ["pending", "expired", "unavailable"]) {
    directory.status = status
    assert.deepEqual(settle(), [], status)
    assert.equal(state.selectedDiscordGuildId, "999999999999999999")
  }
  directory.status = "ready"
  userId = "bob"
  assert.deepEqual(settle(), [])
  directory.clerkUserId = "bob"
  state.selectedDiscordGuildId = "111111111111111111"
  assert.deepEqual(settle(), ["/dashboard/222222222222222222"])
  directory.guilds = directory.guilds.map((guild) => ({
    ...guild,
    verified: false,
  }))
  assert.deepEqual(settle(), ["/dashboard/servers"])
  directory.guilds = []
  assert.deepEqual(settle(), ["/dashboard/servers"])
  authenticated = false
  assert.deepEqual(settle(), [])
})
