import {
  eventDefinitions,
  subscriptionIdentity,
  type EventKey,
} from "@workspace/shared/twitchEventSub"
import type { MutationCtx } from "../_generated/server"
import { internal } from "../_generated/api"

export async function setEventConsumer(
  ctx: MutationCtx,
  input: {
    consumer: string
    key: EventKey
    broadcasterId?: string
    callback: string
    botId: string
    enabled: boolean
  }
) {
  const identity =
    input.broadcasterId && input.enabled
      ? subscriptionIdentity(
          input.key,
          input.broadcasterId,
          input.botId,
          input.callback
        )
      : undefined
  // Membership is changed in the same transaction as customer config.
  const memberships = await ctx.db
    .query("twitchEventConsumers")
    .withIndex("by_consumer", (q) => q.eq("consumer", input.consumer))
    .collect()
  const touched = []
  for (const membership of memberships) {
    const row = await ctx.db.get(membership.subscription)
    if (!row) {
      await ctx.db.delete(membership._id)
      continue
    }
    if (row.identity !== identity) {
      if (row.consumers.includes(input.consumer)) {
        await ctx.db.patch(row._id, {
          consumers: row.consumers.filter(
            (consumer) => consumer !== input.consumer
          ),
          revision: row.revision + 1,
          updatedAt: Date.now(),
        })
        touched.push(row._id)
      }
      await ctx.db.delete(membership._id)
    }
  }
  if (identity && input.broadcasterId) {
    const row = await ctx.db
      .query("twitchEventSubscriptions")
      .withIndex("by_identity", (q) => q.eq("identity", identity))
      .unique()
    if (!row) {
      const subscription = await ctx.db.insert("twitchEventSubscriptions", {
        identity,
        key: input.key,
        broadcasterId: input.broadcasterId,
        callback: input.callback,
        condition: eventDefinitions[input.key].condition(
          input.broadcasterId,
          input.botId
        ),
        consumers: [input.consumer],
        revision: 1,
        status: "connecting",
        updatedAt: Date.now(),
      })
      await ctx.db.insert("twitchEventConsumers", {
        consumer: input.consumer,
        subscription,
      })
      touched.push(subscription)
    } else if (!row.consumers.includes(input.consumer)) {
      if (row.consumers.length >= 1000)
        throw new Error("Subscription consumer capacity reached.")
      await ctx.db.insert("twitchEventConsumers", {
        consumer: input.consumer,
        subscription: row._id,
      })
      await ctx.db.patch(row._id, {
        consumers: [...row.consumers, input.consumer],
        revision: row.revision + 1,
        updatedAt: Date.now(),
      })
      touched.push(row._id)
    }
  }
  for (const subscription of touched)
    await ctx.scheduler.runAfter(0, internal.twitchEventSubActions.reconcile, {
      subscription,
    })
  return touched
}
