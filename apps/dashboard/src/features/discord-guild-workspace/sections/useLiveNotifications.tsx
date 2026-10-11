"use client"
import { useAuth } from "@clerk/nextjs"
import { useAction, useConvex } from "convex/react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { FunctionReturnType } from "convex/server"
import {
  LiveNotificationsDisplayCache,
  liveDisplayKey,
  LIVE_DISPLAY_TTL_MS,
  type LiveDisplay,
} from "../lib/liveNotificationsDisplayCache"
export type LiveNotificationsView = FunctionReturnType<
  typeof api.liveNotificationActions.get
>
const projectionUnavailable = Symbol("projectionUnavailable")
const cache = new LiveNotificationsDisplayCache(() =>
  typeof window === "undefined" ? undefined : window.sessionStorage
)

export function useLiveNotifications(discordGuildId: string) {
  const { userId, sessionId } = useAuth()
  const client = useConvex()
  const verify = useAction(api.liveNotificationActions.get)
  const watcher = useMemo(() => {
    // Restart the subscription when the Clerk identity changes.
    const identity = userId && sessionId
    const query = client.watchQuery(api.liveNotifications.projection, {
      discordGuildId,
    })
    return {
      subscribe: (callback: () => void) => query.onUpdate(callback),
      snapshot: () => {
        try {
          return identity ? query.localQueryResult() : undefined
        } catch {
          return projectionUnavailable
        }
      },
    }
  }, [client, discordGuildId, userId, sessionId])
  const snapshot = useSyncExternalStore(
    watcher.subscribe,
    watcher.snapshot,
    () => undefined
  )
  const projection = snapshot === projectionUnavailable ? undefined : snapshot
  const key =
    userId && sessionId && projection
      ? liveDisplayKey(userId, sessionId, discordGuildId, projection.ownerKey)
      : undefined
  const [verified, setVerified] = useState<{
    key: string
    display: LiveDisplay
  }>()
  const [failure, setFailure] = useState<string>()
  const [reloadCount, setReloadCount] = useState(0)
  const revision =
    projection && "updatedAt" in projection.config
      ? projection.config.updatedAt
      : 0
  useEffect(() => {
    if (snapshot === projectionUnavailable && userId && sessionId) {
      cache.invalidate(userId, sessionId, discordGuildId)
    }
  }, [snapshot, userId, sessionId, discordGuildId])
  useEffect(() => {
    if (!key) return
    let active = true
    void verify({ discordGuildId }).then(
      (view) => {
        if (
          !active ||
          view.ownerKey !== projection?.ownerKey ||
          ("updatedAt" in view.config ? view.config.updatedAt : 0) < revision
        )
          return
        // Display age uses local receipt time, independent of server clock skew.
        const verifiedAt = Date.now()
        if (
          view.source.status === "unavailable" ||
          view.source.status === "configurationUnavailable"
        ) {
          if (!cache.read(key))
            setVerified({
              key,
              display: {
                source: view.source,
                discordStatus: view.discordStatus,
                verifiedAt,
              },
            })
          setFailure(key)
          return
        }
        if (
          view.source.status === "ready" &&
          view.discordStatus === "unavailable" &&
          cache.read(key)
        ) {
          setFailure(key)
          return
        }
        cache.write(key, { ...view, verifiedAt })
        const display = cache.read(key)
        if (display) setVerified({ key, display })
        setFailure(undefined)
      },
      () => {
        if (active) setFailure(key)
      }
    )
    return () => {
      active = false
    }
  }, [verify, discordGuildId, key, projection?.ownerKey, revision, reloadCount])
  // A failed reactive permission check hides the display immediately. An owner
  // evidence change selects a new key and cannot inherit the previous source.
  const display = key
    ? (cache.read(key) ??
      (verified?.key === key &&
      (verified.display.source.status === "unavailable" ||
        verified.display.source.status === "configurationUnavailable")
        ? verified.display
        : undefined))
    : undefined
  const view = projection && display ? { ...projection, ...display } : undefined
  useEffect(() => {
    if (!display) return
    const timer = setTimeout(
      () => {
        setVerified(undefined)
        setReloadCount((value) => value + 1)
      },
      Math.max(0, display.verifiedAt + LIVE_DISPLAY_TTL_MS - Date.now())
    )
    return () => clearTimeout(timer)
  }, [display, key])
  const error =
    snapshot === projectionUnavailable || (!display && !!key && failure === key)
  return {
    view,
    error,
    displayKey: key,
    reload: () => setReloadCount((value) => value + 1),
  }
}
