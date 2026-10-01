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
  if (error || view?.botLeft) return "Unavailable"
  if (!view) return "Loading"
  if (view.source.status === "needsLink") return "Needs Twitch link"
  if (view.source.status !== "ready") return "Unavailable"
  if (!view.config.liveNotificationsEnabled) return "Disabled"
  if (view.discordStatus === "unavailable") return "Unavailable"
  if (view.discordStatus === "needsChannel") return "Needs channel"
  if (view.discordStatus === "needsRole") return "Needs role"
  if (!view.config.liveNotificationChannelId) return "Needs channel"
  return view.subscriptionStatus === "ready"
    ? "Ready"
    : view.subscriptionStatus === "pending"
      ? "Connecting"
      : "Unavailable"
}
