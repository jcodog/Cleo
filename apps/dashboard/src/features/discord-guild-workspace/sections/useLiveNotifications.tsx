"use client"

import { useEffect, useState } from "react"
import { useAction } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { FunctionReturnType } from "convex/server"

export type LiveNotificationsView = FunctionReturnType<
  typeof api.liveNotificationActions.get
>

export function useLiveNotifications(discordGuildId: string) {
  const get = useAction(api.liveNotificationActions.get)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{
    discordGuildId: string
    view?: LiveNotificationsView
    error: boolean
  }>({ discordGuildId, error: false })
  useEffect(() => {
    let active = true
    void get({ discordGuildId })
      .then((view) => {
        if (active) setResult({ discordGuildId, view, error: false })
      })
      .catch(() => {
        if (active) setResult({ discordGuildId, error: true })
      })
    return () => {
      active = false
    }
  }, [discordGuildId, get, revision])
  return {
    view: result.discordGuildId === discordGuildId ? result.view : undefined,
    error: result.discordGuildId === discordGuildId && result.error,
    refresh: () => setRevision((value) => value + 1),
  }
}
