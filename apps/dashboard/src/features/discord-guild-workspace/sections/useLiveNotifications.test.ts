import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"

test("live authority is freshly verified while query updates remain reactive and failures support targeted retry", async (t) => {
  const slots: unknown[] = []
  const effects: { deps: unknown[]; cleanup?: () => void }[] = []
  let stateIndex = 0
  let effectIndex = 0
  let value: unknown
  let queryFailure = false
  let actionFailure = false
  let update = () => {}
  let watches = 0
  let verifies = 0
  let unsubscribed = 0
  const args: unknown[] = []
  const verify = async (arg: unknown) => {
    verifies++
    args.push(arg)
    if (actionFailure) throw new Error("provider unavailable")
    return {
      config: { updatedAt: 1 },
      source: { status: "ready" },
      discordStatus: "needsRole",
    }
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
    exports: { useConvex: () => client, useAction: () => verify },
  })
  const { useLiveNotifications } = await import("./useLiveNotifications")
  const Render = (guild = "one") => {
    stateIndex = effectIndex = 0
    return useLiveNotifications(guild)
  }
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(Render().view, undefined)
  value = {
    config: { updatedAt: 1 },
    source: { status: "stale" },
    subscriptionStatus: "connecting",
    discordStatus: "unavailable",
  }
  update()
  Render()
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
  queryFailure = false
  update()
  Render()
  await flush()
  const before = verifies
  actionFailure = true
  Render().reload()
  Render()
  await flush()
  assert.equal(Render().error, true)
  actionFailure = false
  Render().reload()
  Render()
  await flush()
  assert.equal(Render().error, false)
  assert.equal(verifies, before + 2)
  Render("two")
  await flush()
  assert.equal(watches, 2)
  assert.equal(unsubscribed, 1)
  assert.deepEqual(args.at(-1), { discordGuildId: "two" })
  effects.forEach((effect) => effect.cleanup?.())
})
