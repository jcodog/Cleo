import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { getFunctionName } from "convex/server"

test("reactive progress, route changes and slow Discord never restart hydration; expiry, retry and sessions are bounded", async (t) => {
  const slots: unknown[] = []
  const effects: { deps: unknown[]; cleanup?: () => void }[] = []
  let slot = 0,
    effect = 0,
    accounts = 0,
    guilds = 0,
    now = 1000000
  let pathname = "/dashboard/111111111111111111",
    sessionId = "one"
  let progress: unknown = null
  let complete: ((value: unknown) => void) | undefined
  let reject: ((reason: Error) => void) | undefined
  const timers = new Map<number, () => void>()
  const storage = new Map<string, string>()
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage"
  )
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  })
  t.after(() => {
    effects.forEach((item) => item.cleanup?.())
    if (previousStorage)
      Object.defineProperty(globalThis, "sessionStorage", previousStorage)
    else Reflect.deleteProperty(globalThis, "sessionStorage")
  })
  t.mock.method(Date, "now", () => now)
  t.mock.method(globalThis, "setTimeout", (callback: () => void) => {
    const id = timers.size + 1
    timers.set(id, callback)
    return id
  })
  t.mock.method(globalThis, "clearTimeout", (id: number) => timers.delete(id))
  const syncAccounts = async () => {
    accounts++
    return { status: "ready" }
  }
  const syncGuilds = async () => {
    guilds++
    return new Promise((resolve, fail) => {
      complete = resolve
      reject = fail
    })
  }
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        const at = slot++
        if (!(at in slots)) slots[at] = initial
        return [
          slots[at],
          (next: unknown) => {
            slots[at] = typeof next === "function" ? next(slots[at]) : next
          },
        ]
      },
      useRef: (initial: unknown) => {
        const at = slot++
        if (!(at in slots)) slots[at] = { current: initial }
        return slots[at]
      },
      useEffectEvent: (callback: (...args: unknown[]) => unknown) => {
        const at = slot++
        const previous = slots[at] as
          { callback: typeof callback; event: typeof callback } | undefined
        if (previous) previous.callback = callback
        else {
          const entry = {
            callback,
            event: (...args: unknown[]) => entry.callback(...args),
          }
          slots[at] = entry
        }
        return (slots[at] as { event: typeof callback }).event
      },
      useEffect: (
        callback: () => (() => void) | undefined,
        deps: unknown[]
      ) => {
        const at = effect++
        const previous = effects[at]
        if (
          !previous ||
          deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
        ) {
          previous?.cleanup?.()
          effects[at] = { deps, cleanup: callback() }
        }
      },
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: {
      useAuth: () => ({
        isLoaded: true,
        isSignedIn: true,
        userId: "user",
        sessionId,
      }),
    },
  })
  t.mock.module("next/navigation", { exports: { usePathname: () => pathname } })
  t.mock.module("convex/react", {
    exports: {
      useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
      useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
        getFunctionName(reference).includes("refreshProgress")
          ? progress
          : { providerAccountId: "discord" },
      useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
        getFunctionName(reference).includes("syncLinkedAccounts")
          ? syncAccounts
          : syncGuilds,
    },
  })
  t.mock.module("@workspace/ui/components/button", {
    exports: { Button: "button" },
  })
  const { DashboardDiscordHydrator } =
    await import("./DashboardDiscordHydrator")
  const statuses: string[] = []
  const render = (retryToken = 0) => {
    slot = effect = 0
    return DashboardDiscordHydrator({
      retryToken,
      onStatusChange: (status) => statuses.push(status),
    })
  }
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
  render()
  await flush()
  assert.equal(accounts, 1)
  assert.equal(guilds, 1)
  progress = { state: "pending", observedAt: now }
  render()
  await flush()
  assert.equal(
    accounts,
    1,
    "Progress must not cancel and restart its own request"
  )
  complete?.({ status: "ready", verifiedAt: now })
  await flush()
  render()
  assert.equal(statuses.at(-1), "ready")
  pathname = "/dashboard/222222222222222222/premium"
  progress = { state: "complete", observedAt: now }
  render()
  await flush()
  assert.equal(accounts, 1, "Server switching must not refetch the account")
  now += 300001
  const expire = [...timers.values()][0]
  assert.ok(expire)
  expire()
  render()
  await flush()
  assert.equal(accounts, 2)
  reject?.(new Error("Discord unavailable"))
  await flush()
  render()
  assert.equal(statuses.at(-1), "error")
  progress = { state: "failed", observedAt: now }
  render()
  await flush()
  assert.equal(accounts, 2, "Failure remains stable until explicit retry")
  render(1)
  await flush()
  assert.equal(accounts, 3)
  sessionId = "two"
  render(1)
  await flush()
  assert.equal(accounts, 4)
})
