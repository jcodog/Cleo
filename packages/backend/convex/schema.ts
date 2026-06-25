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
})
