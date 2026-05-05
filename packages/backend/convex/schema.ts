import { defineSchema } from "convex/server"
import { users } from "./dbTables/users"
import { linkedAccounts } from "./dbTables/linkedAccounts"
import { guilds } from "./dbTables/guilds"
import { guildConfigs } from "./dbTables/guildConfigs"
import { errorLogs } from "./dbTables/errorLogs"

export default defineSchema({
  users,
  linkedAccounts,
  guilds,
  guildConfigs,
  errorLogs,
})
