import { query } from "./_generated/server"
import { releaseSha } from "./releaseVersion"
import { v } from "convex/values"

/** Verify deployed code and database availability without returning account data. */
export const read = query({
  args: {},
  returns: v.object({
    sha: v.union(v.string(), v.null()),
    healthy: v.boolean(),
  }),
  handler: async (ctx) => {
    await ctx.db.query("users").first()
    return { sha: releaseSha, healthy: true }
  },
})
