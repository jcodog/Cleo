import { TwitchApi, TwitchFailure, type ChatSubscriptionConfig } from "./api"

export type SubscriptionState =
  { status: "ready"; subscriptionId: string } | { status: "pending" }

export async function reconcileChatSubscription(
  api: TwitchApi,
  appToken: string,
  desired: ChatSubscriptionConfig
): Promise<SubscriptionState> {
  const all = await api.listChatSubscriptions(appToken)
  const owned = all.filter(
    (entry) =>
      entry.type === "channel.chat.message" &&
      entry.version === "1" &&
      entry.condition.broadcaster_user_id === desired.broadcasterId &&
      entry.condition.user_id === desired.botId &&
      entry.transport.method === "webhook"
  )
  if (owned.some((entry) => entry.transport.callback !== desired.callback))
    throw new TwitchFailure("subscriptionUnavailable")
  const enabled = owned.find((entry) => entry.status === "enabled")
  const pending = owned.find(
    (entry) => entry.status === "webhook_callback_verification_pending"
  )
  const keep = enabled ?? pending
  for (const entry of owned) {
    if (entry !== keep) await api.deleteSubscription(appToken, entry.id)
  }
  if (enabled) return { status: "ready", subscriptionId: enabled.id }
  if (!pending) {
    try {
      await api.createChatSubscription(appToken, desired)
    } catch (error) {
      // A concurrent creator can win after our list. Re-list on the next check.
      if (!(error instanceof TwitchFailure && error.status === 409)) throw error
    }
  }
  return { status: "pending" }
}
