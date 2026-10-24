import { defineSchema } from "convex/server"
import {
  communityPayments,
  stripeReconciliationLocks,
} from "./dbTables/communityIntegrations"
import {
  discordModerationPolicies,
  twitchModerationPolicies,
  discordUserInstallations,
  discordConnectionSessions,
  discordRoleConnections,
  communityRoleJobs,
  communityPreferences,
  premiumCheckouts,
  paidCommunityActivations,
  communityAnnouncementOutbox,
  integrationReceipts,
} from "./dbTables/communityIntegrations"
import {
  twitchTimerGroups,
  twitchTimerGrants,
  twitchTimerSessions,
} from "./dbTables/twitchTimers"
import {
  billingCustomers,
  guildSubscriptions,
  billingEvents,
  guildEntitlementGrants,
  guildBillingPrices,
} from "./dbTables/guildBilling"
import { users } from "./dbTables/users"
import {
  twitchEventSubscriptions,
  twitchAnnouncementConfigs,
  twitchWebhookReceipts,
  twitchEventConsumers,
  twitchBotRuntime,
  twitchChatConnections,
  twitchChatConsents,
} from "./dbTables/twitchEventSub"
import { linkedAccounts } from "./dbTables/linkedAccounts"
import {
  guildLiveNotificationConfigs,
  twitchLiveEvents,
  twitchLiveDeliveries,
} from "./dbTables/twitchLiveNotifications"
import { guilds } from "./dbTables/guilds"
import { guildConfigs } from "./dbTables/guildConfigs"
import {
  discordGuildMemberships,
  discordGuildRefreshes,
} from "./dbTables/discordGuildMemberships"
import { errorLogs } from "./dbTables/errorLogs"
import { discordGuildInstallSessions } from "./dbTables/discordGuildInstallSessions"
import { guildAuditEvents } from "./dbTables/guildAuditEvents"
import { guildAuditLogSyncStates } from "./dbTables/guildAuditLogSyncStates"
import { discordBotRuntimeErrors } from "./dbTables/discordBotRuntimeErrors"
import { appFeatureGates } from "./dbTables/appFeatureGates"
import { discordGuildEvents } from "./dbTables/discordGuildEvents"
import { discordModerationActions } from "./dbTables/discordModerationActions"
import { guildSupportConfigs } from "./dbTables/guildSupportConfigs"
import { supportTicketMessages } from "./dbTables/supportTicketMessages"
import { supportTickets } from "./dbTables/supportTickets"
import { staffDiscordMetrics } from "./dbTables/staffDiscordMetrics"
import {
  cleoPetBattleRecords,
  cleoPetInventories,
  cleoPets,
  cleoProfiles,
} from "./dbTables/cleoPets"

export default defineSchema({
  communityPayments,
  stripeReconciliationLocks,
  discordModerationPolicies,
  twitchModerationPolicies,
  discordUserInstallations,
  discordConnectionSessions,
  discordRoleConnections,
  communityRoleJobs,
  communityPreferences,
  premiumCheckouts,
  paidCommunityActivations,
  communityAnnouncementOutbox,
  integrationReceipts,
  twitchTimerGroups,
  twitchTimerGrants,
  twitchTimerSessions,
  billingCustomers,
  guildBillingPrices,
  guildSubscriptions,
  billingEvents,
  guildEntitlementGrants,
  twitchEventSubscriptions,
  twitchEventConsumers,
  twitchBotRuntime,
  twitchChatConnections,
  twitchChatConsents,
  twitchAnnouncementConfigs,
  twitchWebhookReceipts,
  users,
  linkedAccounts,
  guildLiveNotificationConfigs,
  twitchLiveEvents,
  twitchLiveDeliveries,
  guilds,
  guildConfigs,
  discordGuildMemberships,
  discordGuildRefreshes,
  discordGuildInstallSessions,
  errorLogs,
  guildAuditEvents,
  guildAuditLogSyncStates,
  discordBotRuntimeErrors,
  appFeatureGates,
  discordGuildEvents,
  discordModerationActions,
  guildSupportConfigs,
  supportTickets,
  supportTicketMessages,
  staffDiscordMetrics,
  cleoProfiles,
  cleoPets,
  cleoPetInventories,
  cleoPetBattleRecords,
})
