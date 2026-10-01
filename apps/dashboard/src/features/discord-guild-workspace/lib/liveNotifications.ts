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
  if (!view.config.liveNotificationsEnabled)
    return view.subscriptionStatus === "providerUnavailable"
      ? "Provider unavailable"
      : view.subscriptionStatus === "failed"
        ? "Subscription failed"
        : "Disabled"
  if (
    view.source.status === "missingPermission" ||
    view.source.status === "needsLink" ||
    view.source.status === "stale"
  )
    return "Missing permission"
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
