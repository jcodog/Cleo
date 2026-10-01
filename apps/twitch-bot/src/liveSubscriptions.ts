import { z } from "zod"
import { TwitchApi, TwitchFailure } from "./api"

export type LiveSubscriptionState = {
  broadcasterId: string
  status: "ready" | "pending" | "unavailable"
}
const sourcesSchema = z
  .object({ broadcasterIds: z.array(z.string().regex(/^[1-9]\d*$/)).max(500) })
  .strict()

export async function loadLiveSources(
  callback: string,
  secret: string,
  states: LiveSubscriptionState[],
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<string[]> {
  const endpoint = new URL("/twitch-live-sources", callback)
  const response = await request(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ states }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    redirect: "error",
  })
  if (!response.ok) throw new TwitchFailure("subscriptionUnavailable")
  const parsed = sourcesSchema.safeParse(await response.json())
  if (!parsed.success) throw new TwitchFailure("malformedResponse")
  return [...new Set(parsed.data.broadcasterIds)]
}

export async function reconcileLiveSubscriptions(
  api: TwitchApi,
  appToken: string,
  broadcasterIds: string[],
  callback: string,
  secret: string
): Promise<LiveSubscriptionState[]> {
  const subscriptions = await api.listOnlineSubscriptions(appToken)
  const owned = subscriptions.filter(
    (entry) =>
      entry.type === "stream.online" &&
      entry.version === "1" &&
      entry.transport.method === "webhook" &&
      entry.transport.callback === callback
  )
  const desired = new Set(broadcasterIds)
  for (const entry of owned) {
    if (
      !entry.condition.broadcaster_user_id ||
      !desired.has(entry.condition.broadcaster_user_id)
    )
      await api.deleteSubscription(appToken, entry.id)
  }
  const states: LiveSubscriptionState[] = []
  for (const broadcasterId of desired) {
    const matches = owned.filter(
      (entry) => entry.condition.broadcaster_user_id === broadcasterId
    )
    const keep =
      matches.find((entry) => entry.status === "enabled") ??
      matches.find(
        (entry) => entry.status === "webhook_callback_verification_pending"
      )
    for (const entry of matches)
      if (entry !== keep) await api.deleteSubscription(appToken, entry.id)
    if (!keep) {
      try {
        await api.createOnlineSubscription(appToken, {
          broadcasterId,
          callback,
          secret,
        })
      } catch (error) {
        if (!(error instanceof TwitchFailure && error.status === 409))
          throw error
      }
    }
    states.push({
      broadcasterId,
      status: keep?.status === "enabled" ? "ready" : "pending",
    })
  }
  return states
}
