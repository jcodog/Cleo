"use node"

import { action } from "../../../../_generated/server"
import { dashboardDiscordInstallableGuildsResult } from "../../../../lib/validators"
import { syncDashboardGuilds as runDashboardGuildSync } from "../lib/dashboardGuildSync"

export const sync = action({
  args: {},
  returns: dashboardDiscordInstallableGuildsResult,
  handler: async (ctx) => await runDashboardGuildSync(ctx),
})
