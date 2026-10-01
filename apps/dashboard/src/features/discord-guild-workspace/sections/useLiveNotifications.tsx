"use client"
import { useAction, useConvex } from "convex/react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { FunctionReturnType } from "convex/server"
export type LiveNotificationsView = FunctionReturnType<
  typeof api.liveNotificationActions.get
>
const projectionUnavailable = Symbol("projectionUnavailable")
export function useLiveNotifications(discordGuildId: string) {
  const client = useConvex()
  const verify = useAction(api.liveNotificationActions.get)
  const watcher = useMemo(() => {
    const query = client.watchQuery(api.liveNotifications.projection, {
      discordGuildId,
    })
    return {
      subscribe: (callback: () => void) => query.onUpdate(callback),
      snapshot: () => {
        try {
          return query.localQueryResult()
        } catch {
          return projectionUnavailable
        }
      },
    }
  }, [client, discordGuildId])
  const snapshot = useSyncExternalStore(
    watcher.subscribe,
    watcher.snapshot,
    () => undefined
  )
  const projection = snapshot === projectionUnavailable ? undefined : snapshot
  const [verified, setVerified] = useState<{
    guild: string
    revision: number
    view: LiveNotificationsView
  }>()
  const [failure, setFailure] = useState<{ guild: string; revision: number }>()
  const [reloadCount, setReloadCount] = useState(0)
  const revision =
    projection && "updatedAt" in projection.config
      ? projection.config.updatedAt
      : 0
  useEffect(() => {
    let active = true
    void verify({ discordGuildId }).then(
      (view) => {
        if (active) {
          setVerified({
            guild: discordGuildId,
            revision: "updatedAt" in view.config ? view.config.updatedAt : 0,
            view,
          })
          setFailure(undefined)
        }
      },
      () => {
        if (active) setFailure({ guild: discordGuildId, revision })
      }
    )
    return () => {
      active = false
    }
  }, [verify, discordGuildId, revision, reloadCount])
  const authority =
    verified?.guild === discordGuildId && verified.revision === revision
      ? verified.view
      : undefined
  const view =
    projection && authority
      ? {
          ...projection,
          source: authority.source,
          discordStatus: authority.discordStatus,
        }
      : projection
  const error =
    snapshot === projectionUnavailable ||
    (failure?.guild === discordGuildId && failure.revision === revision)
  return { view, error, reload: () => setReloadCount((value) => value + 1) }
}
