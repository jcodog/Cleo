import { v } from "convex/values"

import { query } from "../../../_generated/server"
import { getCurrentUser } from "../../../lib/auth"

const staffAccessResult = v.object({
  status: v.union(v.literal("forbidden"), v.literal("ready")),
})

export const get = query({
  args: {},
  returns: staffAccessResult,
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const ready = Boolean(
      user &&
      user.status !== "disabled" &&
      ["staff", "admin", "superadmin"].includes(user.role)
    )

    return {
      status: ready ? ("ready" as const) : ("forbidden" as const),
    }
  },
})
