import { subscriptionStatus } from "../dbTables/twitchEventSub"
import { v } from "convex/values"
import {
  guildLiveNotificationConfigs,
  liveConfigFields,
  twitchLiveDeliveries,
  twitchLiveEvents,
} from "../dbTables/twitchLiveNotifications"
import { guildDoc, linkedAccountDoc, userDoc } from "./validators"

export const liveConfigDoc = v.object({
  ...guildLiveNotificationConfigs.validator.fields,
  _id: v.id("guildLiveNotificationConfigs"),
  _creationTime: v.number(),
})
export const liveEventDoc = v.object({
  ...twitchLiveEvents.validator.fields,
  _id: v.id("twitchLiveEvents"),
  _creationTime: v.number(),
})
export const liveDeliveryDoc = v.object({
  ...twitchLiveDeliveries.validator.fields,
  _id: v.id("twitchLiveDeliveries"),
  _creationTime: v.number(),
})
export const linkedOwner = v.object({
  status: v.literal("linked"),
  guild: guildDoc,
  user: userDoc,
  discord: linkedAccountDoc,
  twitch: linkedAccountDoc,
  twitchAccounts: v.array(linkedAccountDoc),
})
export const ownerTwitch = v.union(
  linkedOwner,
  v.object({ status: v.literal("needsLink") }),
  v.object({ status: v.literal("unavailable") })
)
export const liveConfig = v.union(liveConfigDoc, v.object(liveConfigFields))
export const managedLiveConfig = v.object({
  guild: guildDoc,
  user: userDoc,
  isOwner: v.boolean(),
  config: liveConfig,
  owner: ownerTwitch,
})
export const liveSource = v.union(
  v.object({
    status: v.union(
      v.literal("needsLink"),
      v.literal("unavailable"),
      v.literal("stale"),
      v.literal("missingPermission")
    ),
  }),
  v.object({
    status: v.literal("ready"),
    broadcasterId: v.string(),
    login: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
  })
)
export const liveWorkspace = v.object({
  config: liveConfig,
  source: liveSource,
  isOwner: v.boolean(),
  botLeft: v.boolean(),
  discordStatus: v.union(
    v.literal("ready"),
    v.literal("unavailable"),
    v.literal("needsChannel"),
    v.literal("needsRole")
  ),
  subscriptionStatus,
})
export const claimedLiveDelivery = v.object({
  ...liveDeliveryDoc.fields,
  discordGuildId: v.string(),
  ownerDiscordId: v.optional(v.string()),
  claim: v.string(),
  config: liveConfigDoc,
})
