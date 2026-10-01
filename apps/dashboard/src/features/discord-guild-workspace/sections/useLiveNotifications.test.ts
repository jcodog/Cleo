import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import type { LiveNotificationsView } from "./useLiveNotifications"

test("live settings hook handles success, errors, refresh, guild changes and cancellation", async (t) => {
  const state: unknown[] = []
  let slot = 0
  let dependencies: unknown[] | undefined
  let cleanup: (() => void) | undefined
  let runEffect: (() => void | (() => void)) | undefined
  const requests: {
    guild: string
    resolve: (view: LiveNotificationsView) => void
    reject: (error: Error) => void
  }[] = []
  const load = ({ discordGuildId }: { discordGuildId: string }) =>
    new Promise<LiveNotificationsView>((resolve, reject) =>
      requests.push({ guild: discordGuildId, resolve, reject })
    )
  t.mock.module("react", {
    exports: {
      ...React,
      useState: (initial: unknown) => {
        const index = slot++
        if (!(index in state)) state[index] = initial
        return [
          state[index],
          (next: unknown) => {
            state[index] =
              typeof next === "function" ? next(state[index]) : next
          },
        ]
      },
      useEffect: (effect: () => void | (() => void), next: unknown[]) => {
        if (
          !dependencies ||
          next.some((value, index) => value !== dependencies![index])
        ) {
          dependencies = next
          runEffect = effect
        }
      },
    },
  })
  t.mock.module("convex/react", { exports: { useAction: () => load } })
  const { useLiveNotifications } = await import("./useLiveNotifications")
  const RenderHook = (guild = "one") => {
    slot = 0
    const result = useLiveNotifications(guild)
    if (runEffect) {
      cleanup?.()
      cleanup = runEffect() ?? undefined
      runEffect = undefined
    }
    return result
  }
  const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  const view = {
    config: {
      liveNotificationsEnabled: false,
      liveNotificationMentionMode: "none",
    },
    source: { status: "needsLink" },
    isOwner: false,
    botLeft: false,
    discordStatus: "ready",
    subscriptionStatus: "unavailable",
  } satisfies LiveNotificationsView
  assert.equal(RenderHook().view, undefined)
  assert.equal(requests[0]?.guild, "one")
  requests[0]!.resolve(view)
  await flush()
  assert.deepEqual(RenderHook().view, view)
  RenderHook().refresh()
  RenderHook()
  requests[1]!.reject(new Error("unavailable"))
  await flush()
  assert.equal(RenderHook().error, true)
  RenderHook().refresh()
  RenderHook()
  assert.equal(RenderHook("two").view, undefined)
  requests[2]!.resolve(view)
  await flush()
  assert.equal(RenderHook("two").view, undefined)
  requests[3]!.resolve({ ...view, isOwner: true })
  await flush()
  assert.equal(RenderHook("two").view?.isOwner, true)
  RenderHook("two").refresh()
  RenderHook("two")
  cleanup?.()
  requests[4]!.resolve(view)
  await flush()
  assert.equal(RenderHook("two").view?.isOwner, true)
})
