import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import {
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server"
import { requireCurrentUser, requireStaff } from "./lib/auth"

async function manager(ctx: QueryCtx | MutationCtx) {
  const user = await requireCurrentUser(ctx)
  const allowed =
    backendEnv.STRIPE_CATALOGUE_MANAGER_IDS?.split(",").map((id) =>
      id.trim()
    ) ?? []
  if (
    !allowed.includes(user.clerkUserId) ||
    !["admin", "superadmin"].includes(user.role)
  )
    throw new ConvexError("Financial management permission is required.")
  return user
}

export const access = query({
  args: {},
  returns: v.object({ canRead: v.boolean(), canWrite: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    return {
      canRead: ["staff", "admin", "superadmin"].includes(user.role),
      canWrite:
        backendEnv.STRIPE_CATALOGUE_WRITES_ENABLED === "true" &&
        ["admin", "superadmin"].includes(user.role) &&
        (
          backendEnv.STRIPE_CATALOGUE_MANAGER_IDS?.split(",").map((id) =>
            id.trim()
          ) ?? []
        ).includes(user.clerkUserId),
    }
  },
})
export const authority = internalQuery({
  args: { write: v.boolean() },
  returns: v.object({ clerkUserId: v.string(), sessionId: v.string() }),
  handler: async (ctx, args) => {
    const user = args.write ? await manager(ctx) : await requireStaff(ctx)
    if (args.write && backendEnv.STRIPE_CATALOGUE_WRITES_ENABLED !== "true")
      throw new ConvexError("Sandbox catalogue writes are disabled.")
    const identity = await ctx.auth.getUserIdentity()
    return {
      clerkUserId: user.clerkUserId,
      sessionId: typeof identity?.sid === "string" ? identity.sid : "",
    }
  },
})
export const mappings = internalQuery({
  args: {},
  returns: v.array(v.object({ productId: v.string(), priceId: v.string() })),
  handler: async (ctx) => {
    await requireStaff(ctx)
    return (await ctx.db.query("guildBillingPrices").take(500))
      .filter((row) => row.enabled)
      .map((row) => ({
        productId: row.stripeProductId,
        priceId: row.stripePriceId,
      }))
  },
})
export const claim = internalMutation({
  args: {
    key: v.string(),
    request: v.string(),
    accountId: v.string(),
    worker: v.string(),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const user = await manager(ctx)
    if (
      backendEnv.STRIPE_CATALOGUE_WRITES_ENABLED !== "true" ||
      args.accountId !== backendEnv.STRIPE_EXPECTED_ACCOUNT_ID
    )
      throw new ConvexError(
        "Sandbox catalogue writes are disabled or account changed."
      )
    const row = await ctx.db
      .query("billingCatalogueOperations")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("key", args.key)
      )
      .unique()
    if (row) {
      if (row.request !== args.request || row.accountId !== args.accountId)
        throw new ConvexError(
          "Operation key cannot be reused with different terms."
        )
      if (row.result !== undefined) return row.result
      if (row.leaseUntil > Date.now())
        throw new ConvexError(
          "This operation is already processing. Retry with the same request."
        )
      if (row.createdAt < Date.now() - 23 * 3600000)
        throw new ConvexError(
          "This uncertain operation needs investigation in Stripe before retrying."
        )
      await ctx.db.patch(row._id, {
        worker: args.worker,
        leaseUntil: Date.now() + 60000,
      })
    } else
      await ctx.db.insert("billingCatalogueOperations", {
        ...args,
        userId: user._id,
        createdAt: Date.now(),
        leaseUntil: Date.now() + 60000,
      })
    return null
  },
})
export const complete = internalMutation({
  args: {
    key: v.string(),
    worker: v.string(),
    result: v.string(),
    mapping: v.optional(
      v.object({ productId: v.string(), priceId: v.string() })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await manager(ctx)
    const row = await ctx.db
      .query("billingCatalogueOperations")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("key", args.key)
      )
      .unique()
    if (
      !row ||
      row.worker !== args.worker ||
      row.leaseUntil <= Date.now() ||
      row.accountId !== backendEnv.STRIPE_EXPECTED_ACCOUNT_ID ||
      backendEnv.STRIPE_CATALOGUE_WRITES_ENABLED !== "true"
    )
      throw new ConvexError(
        "Catalogue operation authority expired. Retry the same operation."
      )
    if (args.mapping) {
      const current = await ctx.db
        .query("guildBillingPrices")
        .withIndex("by_stripe_price_id", (q) =>
          q.eq("stripePriceId", args.mapping!.priceId)
        )
        .unique()
      if (current && current.stripeProductId !== args.mapping.productId)
        throw new ConvexError("Price Product cannot change.")
      if (current)
        await ctx.db.patch(current._id, {
          enabled: true,
          updatedAt: Date.now(),
        })
      else
        await ctx.db.insert("guildBillingPrices", {
          stripeProductId: args.mapping.productId,
          stripePriceId: args.mapping.priceId,
          enabled: true,
          updatedAt: Date.now(),
        })
    }
    await ctx.db.patch(row._id, {
      result: args.result,
      completedAt: Date.now(),
      leaseUntil: 0,
    })
    return null
  },
})
export const history = query({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      request: v.string(),
      createdAt: v.number(),
      completedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx) => {
    await requireStaff(ctx)
    return (
      await ctx.db
        .query("billingCatalogueOperations")
        .withIndex("by_created")
        .order("desc")
        .take(30)
    ).map(({ key, request, createdAt, completedAt }) => ({
      key,
      request,
      createdAt,
      completedAt,
    }))
  },
})
