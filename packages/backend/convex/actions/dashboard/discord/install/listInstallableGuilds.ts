"use node"

import { action } from "../../../../_generated/server"
import { dashboardDiscordInstallableGuildsResult } from "../../../../lib/validators"
import { syncDashboardGuilds } from "../lib/dashboardGuildSync"

export const list = action({
  args: {},
  returns: dashboardDiscordInstallableGuildsResult,
  handler: async (ctx) => await syncDashboardGuilds(ctx),
})
