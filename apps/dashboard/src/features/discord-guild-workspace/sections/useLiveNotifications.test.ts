import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { getFunctionName } from "convex/server"

test("live authority is freshly verified while query updates remain reactive and failures support targeted retry", async (t) => {
  const slots: unknown[] = []
  const effects: { deps: unknown[]; cleanup?: () => void }[] = []
  t.after(() => effects.forEach((effect) => effect.cleanup?.()))
  let stateIndex = 0
  let effectIndex = 0
  let value: unknown
  let queryFailure = false
  let actionFailure = false
  let update = () => {}
  let watches = 0
  let verifies = 0
  let recoveries = 0
  let userId = "user-one"
  let ownerKey = "owner-one"
  let nextStatus = "ready"
  let revision = 1
  let delayed: ((view: unknown) => void) | undefined
  let delay = false
  let unsubscribed = 0
  const args: unknown[] = []
  const verify = async (arg: unknown) => {
    verifies++
    args.push(arg)
    if (actionFailure) throw new Error("provider unavailable")
    const result = {
      ownerKey,
      verifiedAt: Date.now() + 1000,
      config: { updatedAt: revision },
      source:
        nextStatus === "ready"
          ? {
              status: "ready",
              broadcasterId: "123",
              login: "owner",
              displayName: "Owner",
            }
          : { status: nextStatus },
      discordStatus: "needsRole",
    }
    if (delay)
      return new Promise((resolve) => {
        delayed = resolve
      })
    return result
  }
  const client = {
    watchQuery: (_query: unknown, arg: unknown) => {
      watches++
      args.push(arg)
      return {
        localQueryResult: () => {
          if (queryFailure) throw new Error("query denied")
          return value
        },
        onUpdate: (callback: () => void) => {
          update = callback
          return () => {
            unsubscribed++
          }
        },
      }
    },
  }
  t.mock.module("react", {
    exports: {
      ...React,
      useMemo: (create: () => unknown, deps: unknown[]) => {
        const index = stateIndex++
        const previous = slots[index] as
          { deps: unknown[]; value: unknown } | undefined
        if (
          !previous ||
          deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
        )
          slots[index] = { deps, value: create() }
        return (slots[index] as { value: unknown }).value
      },
      useSyncExternalStore: (
        subscribe: (callback: () => void) => () => void,
        snapshot: () => unknown
      ) => {
        const index = stateIndex++
        const previous = slots[index] as
          { subscribe: unknown; cleanup: () => void } | undefined
        if (previous?.subscribe !== subscribe) {
          previous?.cleanup()
          slots[index] = { subscribe, cleanup: subscribe(() => {}) }
        }
        return snapshot()
      },
      useState: (initial: unknown) => {
        const index = stateIndex++
        if (!(index in slots)) slots[index] = initial
        return [
          slots[index],
          (next: unknown) => {
            slots[index] =
              typeof next === "function" ? next(slots[index]) : next
          },
        ]
      },
      useEffect: (
        callback: () => (() => void) | undefined,
        deps: unknown[]
      ) => {
        const index = effectIndex++
        const previous = effects[index]
        if (
          !previous ||
          deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
        ) {
          previous?.cleanup?.()
          effects[index] = { deps, cleanup: callback() }
        }
      },
    },
  })
  t.mock.module("convex/react", {
    exports: {
      useConvex: () => client,
      useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
        getFunctionName(reference) === "liveNotificationActions:get"
          ? verify
          : async () => {
              recoveries++
              return { status: "ready" }
            },
    },
  })
  t.mock.module("@clerk/nextjs", {
    exports: { useAuth: () => ({ userId, sessionId: "session" }) },
  })
  const { useLiveNotifications } = await import("./useLiveNotifications")
  const Render = (guild = "one") => {
    stateIndex = effectIndex = 0
    return useLiveNotifications(guild)
  }
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(Render().view, undefined)
  value = {
    ownerKey,
    config: { updatedAt: 1 },
    source: { status: "stale" },
    subscriptionStatus: "connecting",
    discordStatus: "unavailable",
  }
  update()
  assert.equal(
    Render().view,
    undefined,
    "Initial provisional stale projection uses the skeleton"
  )
  await flush()
  assert.equal(Render().view?.source.status, "ready")
  assert.equal(Render().view?.discordStatus, "needsRole")
  value = { ...(value as object), subscriptionStatus: "ready" }
  update()
  assert.equal(Render().view?.subscriptionStatus, "ready")
  assert.equal(watches, 1)
  queryFailure = true
  update()
  assert.equal(Render().error, true)
  Render().reload()
  await flush()
  assert.equal(
    recoveries,
    1,
    "An expired permission projection retries guild verification"
  )
  queryFailure = false
  update()
  Render()
  await flush()
  const before = verifies
  actionFailure = true
  Render().reload()
  Render()
  await flush()
  assert.equal(Render().error, false)
  assert.equal(
    Render().view?.source.status,
    "ready",
    "Temporary verification failure preserves display"
  )
  actionFailure = false
  Render().reload()
  Render()
  await flush()
  assert.equal(Render().error, false)
  assert.equal(verifies, before + 2)
  // A cached Ready refresh has no provisional source or loading transition.
  Render().reload()
  assert.equal(Render().view?.source.status, "ready")
  await flush()
  assert.equal(Render().view?.source.status, "ready")
  nextStatus = "stale"
  Render().reload()
  assert.equal(Render().view?.source.status, "ready")
  await flush()
  assert.equal(
    Render().view?.source.status,
    "stale",
    "Fresh reconnect evidence replaces cached Ready"
  )
  nextStatus = "ready"
  Render("two")
  await flush()
  assert.equal(watches, 2)
  assert.equal(unsubscribed, 1)
  assert.deepEqual(args.at(-1), { discordGuildId: "two" })
  userId = "user-two"
  assert.equal(
    Render("two").view,
    undefined,
    "User switch cannot inherit display"
  )
  await flush()
  ownerKey = "owner-two"
  value = { ...(value as object), ownerKey }
  assert.equal(
    Render("two").view,
    undefined,
    "Owner evidence switch invalidates display"
  )
  await flush()
  delay = true
  revision = 2
  value = { ...(value as object), config: { updatedAt: revision } }
  Render("two")
  const oldResponse = delayed
  assert.ok(oldResponse)
  revision = 3
  value = { ...(value as object), config: { updatedAt: revision } }
  delay = false
  Render("two")
  await flush()
  oldResponse({
    ownerKey,
    verifiedAt: Date.now() + 1,
    config: { updatedAt: 2 },
    source: { status: "stale" },
    discordStatus: "unavailable",
  })
  await flush()
  assert.equal(
    Render("two").view?.source.status,
    "ready",
    "Old async responses cannot overwrite newer verification"
  )
  const config = Render("two").view?.config
  assert.ok(config && "updatedAt" in config)
  assert.equal(config.updatedAt, 3)
  effects.forEach((effect) => effect.cleanup?.())
})
