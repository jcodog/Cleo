import { query } from "./_generated/server"
import { v } from "convex/values"
import { previewBuild } from "./previewVersion"
import { isReviewPreviewIsolated } from "./lib/previewIsolation"

/** Public deployment evidence contains no user data or credential values. */
export const read = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      sha: v.string(),
      branch: v.string(),
      url: v.string(),
      isolated: v.boolean(),
      schemaReady: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    if (!previewBuild) return null
    const isolated = isReviewPreviewIsolated(process.env, previewBuild)
    // Successful push validates the full schema. These reads also prove the
    // billing addition is available on this backend.
    await ctx.db.query("billingCatalogueOperations").first()
    await ctx.db.query("premiumCheckouts").first()
    return {
      sha: previewBuild.sha,
      branch: previewBuild.branch,
      url: previewBuild.url,
      isolated,
      schemaReady: true,
    }
  },
})
