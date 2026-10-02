import type { LiveNotificationsView } from "../sections/useLiveNotifications"

export function getTwitchSourceFeedback(
  status: LiveNotificationsView["source"]["status"]
): {
  description: string | null
  recovery: "retry" | "connect" | "reconnect" | null
} {
  switch (status) {
    case "ready":
      return { description: null, recovery: null }
    case "configurationUnavailable":
      return {
        description:
          "Cleo's Twitch server configuration is unavailable. Try again later.",
        recovery: "retry" as const,
      }
    case "unavailable":
      return {
        description:
          "Twitch connection verification is temporarily unavailable. Try again later.",
        recovery: "retry" as const,
      }
    case "needsLink":
      return {
        description:
          "The Discord server owner must connect Twitch to enable this feature.",
        recovery: "connect" as const,
      }
    case "stale":
      return {
        description:
          "The owner's saved Twitch connection is stale. Reconnect and sync it in Cleo.",
        recovery: "reconnect" as const,
      }
    case "missingPermission":
      return {
        description:
          "The server owner must reconnect Twitch to grant the required permission, then sync the connection.",
        recovery: "reconnect" as const,
      }
  }
}

export function getLiveNotificationState(
  view:
    | {
        botLeft: boolean
        config: {
          liveNotificationsEnabled: boolean
          liveNotificationChannelId?: string
        }
        source: { status: string }
        subscriptionStatus: string
        discordStatus: string
      }
    | undefined,
  error = false
): string {
  if (error || view?.botLeft) return "Provider unavailable"
  if (!view) return "Loading"
  if (view.source.status === "configurationUnavailable")
    return "Server configuration unavailable"
  if (!view.config.liveNotificationsEnabled)
    return view.subscriptionStatus === "providerUnavailable"
      ? "Provider unavailable"
      : view.subscriptionStatus === "failed"
        ? "Subscription failed"
        : "Disabled"
  if (view.source.status === "needsLink") return "Connect Twitch"
  if (view.source.status === "stale") return "Reconnect required"
  if (view.source.status === "missingPermission") return "Missing permission"
  if (view.source.status !== "ready") return "Provider unavailable"
  if (view.discordStatus === "unavailable") return "Provider unavailable"
  if (view.discordStatus === "needsChannel") return "Needs channel"
  if (view.discordStatus === "needsRole") return "Needs role"
  if (!view.config.liveNotificationChannelId) return "Needs channel"
  return view.subscriptionStatus === "ready"
    ? "Ready"
    : view.subscriptionStatus === "connecting"
      ? "Connecting"
      : view.subscriptionStatus === "providerUnavailable"
        ? "Provider unavailable"
        : "Subscription failed"
}
