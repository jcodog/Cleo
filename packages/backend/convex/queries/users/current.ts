import { v } from "convex/values"
import { query } from "../../_generated/server"
import { getCurrentUser } from "../../lib/auth"
import { userDoc } from "../../lib/validators"

export const get = query({
  args: {},
  returns: v.union(userDoc, v.null()),
  handler: async (ctx) => await getCurrentUser(ctx),
})
