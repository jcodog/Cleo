import { defineSchema } from "convex/server"
import { users } from "./dbTables/users"
import { linkedAccounts } from "./dbTables/linkedAccounts"
import { guilds } from "./dbTables/guilds"
import { guildConfigs } from "./dbTables/guildConfigs"
import { discordGuildMemberships } from "./dbTables/discordGuildMemberships"
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
import {
  cleoPetBattleRecords,
  cleoPetInventories,
  cleoPets,
  cleoProfiles,
} from "./dbTables/cleoPets"

export default defineSchema({
  users,
  linkedAccounts,
  guilds,
  guildConfigs,
  discordGuildMemberships,
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
  cleoProfiles,
  cleoPets,
  cleoPetInventories,
  cleoPetBattleRecords,
})
