import { v } from "convex/values"

import { query } from "../../../../_generated/server"
import { isAppFeatureEnabledForUser } from "../../../../lib/appFeatureGates"
import { getCurrentUser } from "../../../../lib/auth"
import { getRuntimeIncidentAccessStatus } from "./list"

const runtimeIncidentAccessResult = v.union(
  v.object({ status: v.literal("forbidden") }),
  v.object({ status: v.literal("disabled") }),
  v.object({ status: v.literal("ready") })
)

export const get = query({
  args: {},
  returns: runtimeIncidentAccessResult,
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user || getRuntimeIncidentAccessStatus(user, false) === "forbidden") {
      return { status: "forbidden" as const }
    }

    const featureEnabled = await isAppFeatureEnabledForUser(
      ctx,
      "discordRuntimeIncidents",
      user
    )

    return { status: getRuntimeIncidentAccessStatus(user, featureEnabled) }
  },
})
