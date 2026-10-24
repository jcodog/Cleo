import { v } from "convex/values"
import {
  discordRoleConnections,
  premiumCheckouts,
  communityAnnouncementOutbox,
} from "../dbTables/communityIntegrations"
import { guilds } from "../dbTables/guilds"
import { billingCustomers, guildBillingPrices } from "../dbTables/guildBilling"
export const roleConnectionDoc = v.object({
  ...discordRoleConnections.validator.fields,
  _id: v.id("discordRoleConnections"),
  _creationTime: v.number(),
})
export const checkoutDoc = v.object({
  ...premiumCheckouts.validator.fields,
  _id: v.id("premiumCheckouts"),
  _creationTime: v.number(),
})
export const announcementDoc = v.object({
  ...communityAnnouncementOutbox.validator.fields,
  _id: v.id("communityAnnouncementOutbox"),
  _creationTime: v.number(),
})
export const billingCustomerDoc = v.object({
  ...billingCustomers.validator.fields,
  _id: v.id("billingCustomers"),
  _creationTime: v.number(),
})
export const billingPriceDoc = v.object({
  ...guildBillingPrices.validator.fields,
  _id: v.id("guildBillingPrices"),
  _creationTime: v.number(),
})
export const communityGuildDoc = v.object({
  ...guilds.validator.fields,
  _id: v.id("guilds"),
  _creationTime: v.number(),
})
export const moderationRuntimeValue = v.union(
  v.null(),
  v.object({
    revision: v.number(),
    policyJSON: v.string(),
    enforcement: v.boolean(),
    authorityUntil: v.number(),
    leaseDurationMs: v.number(),
  })
)
