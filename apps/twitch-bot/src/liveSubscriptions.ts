import { z } from "zod"
import { TwitchApi, TwitchFailure } from "./api"

export type LiveSubscriptionState = {
  broadcasterId: string
  status: "ready" | "pending" | "unavailable"
}
const sourcesSchema = z
  .object({
    broadcasterIds: z.array(z.string().regex(/^[1-9]\d*$/)).max(500),
    continueCursor: z.string().nullable().optional(),
  })
  .strict()

export async function loadLiveSources(
  callback: string,
  secret: string,
  states: LiveSubscriptionState[],
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<string[]> {
  if (states.length > 100)
    await publishLiveStates(
      callback,
      secret,
      states.slice(100),
      signal,
      request
    )
  const ids = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    const endpoint = new URL("/twitch-live-sources", callback)
    const response = await request(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        states: cursor ? [] : states.slice(0, 100),
        ...(cursor ? { cursor } : {}),
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
      redirect: "error",
    })
    if (!response.ok) throw new TwitchFailure("subscriptionUnavailable")
    const parsed = sourcesSchema.safeParse(await response.json())
    if (!parsed.success) throw new TwitchFailure("malformedResponse")
    for (const id of parsed.data.broadcasterIds) ids.add(id)
    cursor = parsed.data.continueCursor ?? null
    if (cursor && cursors.has(cursor))
      throw new TwitchFailure("malformedResponse")
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return [...ids]
}

export async function publishLiveStates(
  callback: string,
  secret: string,
  states: LiveSubscriptionState[],
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<void> {
  for (let offset = 0; offset < states.length; offset += 100) {
    const response = await request(new URL("/twitch-live-sources", callback), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        states: states.slice(offset, offset + 100),
        healthOnly: true,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      redirect: "error",
    })
    if (!response.ok) throw new TwitchFailure("subscriptionUnavailable")
  }
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
      entry.transport.method === "webhook"
  )
  // Other callbacks may be a previous deployment or a shared app. Do not delete
  // them blindly or report a conflicting create as healthy/pending.
  if (owned.some((entry) => entry.transport.callback !== callback)) {
    const error = new TwitchFailure("subscriptionUnavailable")
    error.message +=
      ": stream.online callback mismatch; inspect and migrate the app's existing subscriptions before retrying."
    throw error
  }
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
      await api.createOnlineSubscription(appToken, {
        broadcasterId,
        callback,
        secret,
      })
    }
    states.push({
      broadcasterId,
      status: keep?.status === "enabled" ? "ready" : "pending",
    })
  }
  return states
}
