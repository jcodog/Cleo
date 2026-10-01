"use client"
import { useQuery } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { FunctionReturnType } from "convex/server"
export type LiveNotificationsView = FunctionReturnType<
  typeof api.liveNotifications.projection
>
export function useLiveNotifications(discordGuildId: string) {
  const view = useQuery(api.liveNotifications.projection, { discordGuildId })
  return { view, error: false }
}
