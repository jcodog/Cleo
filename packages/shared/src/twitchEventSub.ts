import { z } from "zod"

export const TEMPLATE_LIMIT = 400
export const TWITCH_CHAT_LIMIT = 500
export const ANONYMOUS_USER = "An anonymous viewer"
const id = z.string().regex(/^[1-9]\d*$/)
const text = z.string().min(1).max(500)
const count = z.number().int().nonnegative().safe()
const broadcaster = z.object({
  broadcaster_user_id: id,
  broadcaster_user_login: z.string().regex(/^[a-zA-Z0-9_]{1,25}$/),
  broadcaster_user_name: text,
})
const user = broadcaster.extend({ user_name: text })
const anonymous = broadcaster.extend({
  is_anonymous: z.boolean(),
  user_name: text.nullish(),
})
const tier = z.enum(["1000", "2000", "3000"])
const commonValues = (event: z.infer<typeof broadcaster>) => ({
  channel: event.broadcaster_user_name,
})
const tierName = (value: z.infer<typeof tier>) => `Tier ${Number(value) / 1000}`
const standardCondition = (
  broadcasterId: string,
  _botId: string
): Record<string, string> => ({ broadcaster_user_id: broadcasterId })

function definition<S extends z.ZodType>(options: {
  type: string
  version: string
  scopes: readonly string[]
  schema: S
  condition?: (broadcasterId: string, botId: string) => Record<string, string>
}) {
  return {
    ...options,
    condition: options.condition ?? standardCondition,
    parse: (value: unknown): z.infer<S> => options.schema.parse(value),
  }
}
function announcement<S extends z.ZodType>(
  options: Parameters<typeof definition<S>>[0] & {
    label: string
    group: "Community" | "Subscriptions" | "Support"
    defaultTemplate: string
    tags: Record<string, { description: string; sample: string }>
    values: (event: z.infer<S>) => Record<string, string>
    defaultFormatter?: (values: Record<string, string>) => string
  }
) {
  return {
    ...definition(options),
    ...options,
    allowedTemplateTags: Object.keys(options.tags),
  }
}
const channelTag = {
  channel: {
    description: "Broadcaster display name",
    sample: "ExampleChannel",
  },
}
const userTag = {
  user: {
    description: "Event user, or An anonymous viewer",
    sample: "ExampleViewer",
  },
  ...channelTag,
}
const tierTag = { tier: { description: "Subscription tier", sample: "Tier 1" } }
const totalTag = {
  total: {
    description:
      "Cumulative gifted subscriptions; not available when Twitch omits it",
    sample: "25",
  },
}
const hypeTags = {
  ...channelTag,
  level: { description: "Twitch Hype Train level", sample: "3" },
  total: {
    description: "Total Twitch Hype Train contribution points",
    sample: "1500",
  },
}
const hype = broadcaster.extend({ level: count, total: count })

const definitions = {
  chatMessage: definition({
    type: "channel.chat.message",
    version: "1",
    scopes: [],
    condition: (broadcasterId, botId) => ({
      broadcaster_user_id: broadcasterId,
      user_id: botId,
    }),
    schema: broadcaster.extend({
      chatter_user_id: id,
      message_id: text,
      message: z.object({ text: z.string().max(4096) }),
    }),
  }),
  streamOnline: definition({
    type: "stream.online",
    version: "1",
    scopes: [],
    schema: broadcaster.extend({
      id,
      started_at: z.iso.datetime({ precision: null }),
      type: z.enum(["live", "playlist", "watch_party", "premiere", "rerun"]),
    }),
  }),
  follow: announcement({
    type: "channel.follow",
    version: "2",
    scopes: ["moderator:read:followers"],
    schema: user,
    condition: (broadcasterId) => ({
      broadcaster_user_id: broadcasterId,
      moderator_user_id: broadcasterId,
    }),
    label: "New follow",
    group: "Community",
    defaultTemplate: "Thanks for the follow, {user}! 💜",
    tags: userTag,
    values: (event) => ({ ...commonValues(event), user: event.user_name }),
  }),
  subscribe: announcement({
    type: "channel.subscribe",
    version: "1",
    scopes: ["channel:read:subscriptions"],
    schema: user.extend({ tier, is_gift: z.boolean() }),
    label: "New subscriber",
    group: "Subscriptions",
    defaultTemplate: "Thanks for subscribing, {user}! 💜",
    tags: { ...userTag, ...tierTag },
    values: (event) => ({
      ...commonValues(event),
      user: event.user_name,
      tier: tierName(event.tier),
    }),
  }),
  resubscribe: announcement({
    type: "channel.subscription.message",
    version: "1",
    scopes: ["channel:read:subscriptions"],
    schema: user.extend({ tier, cumulative_months: count }),
    label: "Resubscription",
    group: "Subscriptions",
    defaultTemplate: "{user} just resubscribed for {months} months! 💜",
    tags: {
      ...userTag,
      ...tierTag,
      months: { description: "Cumulative subscribed months", sample: "12" },
    },
    values: (event) => ({
      ...commonValues(event),
      user: event.user_name,
      tier: tierName(event.tier),
      months: String(event.cumulative_months),
    }),
  }),
  subscriptionGift: announcement({
    type: "channel.subscription.gift",
    version: "1",
    scopes: ["channel:read:subscriptions"],
    schema: anonymous.extend({
      tier,
      total: count,
      cumulative_total: count.nullish(),
    }),
    label: "Gifted subscriptions",
    group: "Subscriptions",
    defaultTemplate:
      "{user} gifted {count} subs! That's {total} gifted in total! 💜",
    tags: {
      ...userTag,
      ...tierTag,
      ...totalTag,
      count: { description: "Gift count in this event", sample: "5" },
    },
    values: (event) => ({
      ...commonValues(event),
      user: event.is_anonymous
        ? ANONYMOUS_USER
        : (event.user_name ?? ANONYMOUS_USER),
      tier: tierName(event.tier),
      count: String(event.total),
      total:
        event.cumulative_total == null
          ? "not available"
          : String(event.cumulative_total),
    }),
    defaultFormatter: (values) =>
      `${values.user} gifted ${values.count} subs!${values.total === "not available" ? "" : ` That's ${values.total} gifted in total!`} 💜`,
  }),
  cheer: announcement({
    type: "channel.cheer",
    version: "1",
    scopes: ["bits:read"],
    schema: anonymous.extend({ bits: count }),
    label: "Bits cheered",
    group: "Support",
    defaultTemplate: "Thanks {user} for cheering {bits} Bits! 💜",
    tags: { ...userTag, bits: { description: "Bits cheered", sample: "100" } },
    values: (event) => ({
      ...commonValues(event),
      user: event.is_anonymous
        ? ANONYMOUS_USER
        : (event.user_name ?? ANONYMOUS_USER),
      bits: String(event.bits),
    }),
  }),
  raid: announcement({
    type: "channel.raid",
    version: "1",
    scopes: [],
    schema: z.object({
      to_broadcaster_user_id: id,
      to_broadcaster_user_name: text,
      from_broadcaster_user_name: text,
      viewers: count,
    }),
    condition: (broadcasterId) => ({ to_broadcaster_user_id: broadcasterId }),
    label: "Incoming raid",
    group: "Community",
    defaultTemplate:
      "Welcome raiders! {user} raided with {viewers} viewers! 💜",
    tags: {
      ...userTag,
      viewers: { description: "Incoming viewers", sample: "42" },
    },
    values: (event) => ({
      channel: event.to_broadcaster_user_name,
      user: event.from_broadcaster_user_name,
      viewers: String(event.viewers),
    }),
  }),
  hypeTrainBegin: announcement({
    type: "channel.hype_train.begin",
    version: "2",
    scopes: ["channel:read:hype_train"],
    schema: hype,
    label: "Hype Train started",
    group: "Support",
    defaultTemplate: "🚂 Hype Train started! Let's go!",
    tags: hypeTags,
    values: (event) => ({
      ...commonValues(event),
      level: String(event.level),
      total: String(event.total),
    }),
  }),
  hypeTrainEnd: announcement({
    type: "channel.hype_train.end",
    version: "2",
    scopes: ["channel:read:hype_train"],
    schema: hype,
    label: "Hype Train ended",
    group: "Support",
    defaultTemplate:
      "🚂 Hype Train ended at level {level} with {total} contribution points! 💜",
    tags: hypeTags,
    values: (event) => ({
      ...commonValues(event),
      level: String(event.level),
      total: String(event.total),
    }),
  }),
  charityDonation: announcement({
    type: "channel.charity_campaign.donate",
    version: "1",
    scopes: ["channel:read:charity"],
    schema: user.extend({
      charity_name: text,
      amount: z.object({
        value: count,
        decimal_places: z.number().int().min(0).max(9),
        currency: z.string().regex(/^[A-Z]{3}$/),
      }),
    }),
    label: "Charity donation",
    group: "Support",
    defaultTemplate: "{user} donated {amount} to {charity}! 💜",
    tags: {
      ...userTag,
      amount: { description: "Formatted currency amount", sample: "$10.00" },
      currency: { description: "ISO currency code", sample: "USD" },
      charity: { description: "Charity name", sample: "Example Charity" },
    },
    values: (event) => ({
      ...commonValues(event),
      user: event.user_name,
      amount: formatCharityAmount(event.amount),
      currency: event.amount.currency,
      charity: event.charity_name,
    }),
  }),
} as const
export const eventDefinitions = Object.fromEntries(
  Object.entries(definitions).map(([key, value]) => [
    key,
    { ...value, key, handler: key },
  ])
) as {
  [K in keyof typeof definitions]: (typeof definitions)[K] & {
    key: K
    handler: K
  }
}

export type EventKey = keyof typeof eventDefinitions
export type EventPayload<K extends EventKey> = ReturnType<
  (typeof eventDefinitions)[K]["parse"]
>
export const announcementKeys = [
  "follow",
  "subscribe",
  "resubscribe",
  "subscriptionGift",
  "cheer",
  "raid",
  "hypeTrainBegin",
  "hypeTrainEnd",
  "charityDonation",
] as const
export type AnnouncementKey = (typeof announcementKeys)[number]
export function isAnnouncementKey(key: string): key is AnnouncementKey {
  return announcementKeys.some((value) => value === key)
}
export function isEventKey(key: string): key is EventKey {
  return Object.hasOwn(eventDefinitions, key)
}
export function resolveBroadcasterScopes(keys: readonly EventKey[]): string[] {
  return [
    ...new Set([
      "channel:bot",
      ...keys.flatMap((key) => eventDefinitions[key].scopes),
    ]),
  ]
}
export function subscriptionIdentity(
  key: EventKey,
  broadcasterId: string,
  botId: string,
  callback: string
): string {
  const definition = eventDefinitions[key]
  return JSON.stringify([
    broadcasterId,
    definition.type,
    definition.version,
    Object.entries(definition.condition(broadcasterId, botId)).sort(),
    callback,
  ])
}
export function normalizeChatText(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0)!
      return code < 32 ||
        (code >= 127 && code <= 159) ||
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        code === 0xfeff ||
        (code >= 0xd800 && code <= 0xdfff)
        ? " "
        : character
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}
export function validateTemplate(
  key: AnnouncementKey,
  source: string
): string | undefined {
  if ([...source].length > TEMPLATE_LIMIT)
    throw new Error(`Template must be at most ${TEMPLATE_LIMIT} characters.`)
  const normalized = normalizeChatText(source)
  if (!normalized) throw new Error("Message must not be empty.")
  const definition = eventDefinitions[key]
  const remainder = normalized.replace(
    /\{([a-zA-Z]+)\}/g,
    (_match, tag: string) => {
      if (!definition.allowedTemplateTags.includes(tag))
        throw new Error(`Unsupported tag {${tag}} for ${definition.label}.`)
      return ""
    }
  )
  if (/[{}]/.test(remainder)) throw new Error("Invalid template tag syntax.")
  return normalized === definition.defaultTemplate ? undefined : normalized
}
type RenderDefinition = {
  defaultTemplate: string
  allowedTemplateTags: readonly string[]
  defaultFormatter?: (values: Record<string, string>) => string
}
export function renderTemplate(
  definition: RenderDefinition,
  values: Record<string, string>,
  custom?: string
): string {
  const render = (source: string) => {
    if (/[{}]/.test(source.replace(/\{([a-zA-Z]+)\}/g, ""))) {
      throw new Error("Invalid template tag syntax.")
    }
    return normalizeChatText(
      source.replace(/\{([a-zA-Z]+)\}/g, (_match, tag: string) => {
        if (
          !definition.allowedTemplateTags.includes(tag) ||
          values[tag] === undefined
        )
          throw new Error(`Unsupported or unavailable tag {${tag}}.`)
        return normalizeChatText(values[tag])
      })
    )
  }
  const fallback = () =>
    definition.defaultFormatter
      ? normalizeChatText(definition.defaultFormatter(values))
      : render(definition.defaultTemplate)
  const message = custom ? render(custom) : fallback()
  if ([...message].length <= TWITCH_CHAT_LIMIT) return message
  const defaultMessage = fallback()
  if ([...defaultMessage].length > TWITCH_CHAT_LIMIT)
    throw new Error("Default message exceeds Twitch limit.")
  return defaultMessage
}
export function previewTemplate(key: AnnouncementKey, custom?: string): string {
  const definition = eventDefinitions[key]
  const values = Object.fromEntries(
    Object.entries(definition.tags).map(([tag, data]) => [tag, data.sample])
  )
  const source =
    custom === undefined ? undefined : validateTemplate(key, custom)
  return renderTemplate(definition, values, source)
}
export function formatCharityAmount(amount: {
  value: number
  decimal_places: number
  currency: string
}): string {
  // The decimal representation belongs to Twitch, not the currency's default precision.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: amount.currency,
    minimumFractionDigits: amount.decimal_places,
    maximumFractionDigits: amount.decimal_places,
  }).format(amount.value / 10 ** amount.decimal_places)
}
