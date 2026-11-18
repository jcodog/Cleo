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
  args: { productId: v.string(), priceIds: v.array(v.string()) },
  returns: v.array(v.object({ productId: v.string(), priceId: v.string() })),
  handler: async (ctx, args) => {
    await requireStaff(ctx)
    if (args.priceIds.length > 100)
      throw new ConvexError("Price page exceeds bounds.")
    const rows = await Promise.all(
      args.priceIds.map((id) =>
        ctx.db
          .query("guildBillingPrices")
          .withIndex("by_stripe_price_id", (q) => q.eq("stripePriceId", id))
          .unique()
      )
    )
    return rows
      .filter((row) => row !== null)
      .filter((row) => row.enabled && row.stripeProductId === args.productId)
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
  returns: v.union(
    v.literal("first"),
    v.literal("retry"),
    v.object({ result: v.string() }),
    v.object({ rejection: v.string() })
  ),
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
      if (row.result !== undefined) return { result: row.result }
      if (row.rejection !== undefined) return { rejection: row.rejection }
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
      return "retry" as const
    } else {
      const pending = await ctx.db
        .query("billingCatalogueOperations")
        .withIndex("by_user_completed", (q) =>
          q.eq("userId", user._id).eq("completedAt", undefined)
        )
        .first()
      if (pending)
        throw new ConvexError(
          "Resolve the recorded operation before starting another change."
        )
      await ctx.db.insert("billingCatalogueOperations", {
        ...args,
        userId: user._id,
        createdAt: Date.now(),
        leaseUntil: Date.now() + 60000,
      })
    }
    return "first" as const
  },
})
export const complete = internalMutation({
  args: {
    key: v.string(),
    worker: v.string(),
    outcome: v.union(
      v.object({
        result: v.string(),
        mapping: v.optional(
          v.object({ productId: v.string(), priceId: v.string() })
        ),
      }),
      v.object({ rejection: v.string() })
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
      row.completedAt !== undefined ||
      row.worker !== args.worker ||
      row.leaseUntil <= Date.now() ||
      row.accountId !== backendEnv.STRIPE_EXPECTED_ACCOUNT_ID ||
      backendEnv.STRIPE_CATALOGUE_WRITES_ENABLED !== "true"
    )
      throw new ConvexError(
        "Catalogue operation authority expired. Retry the same operation."
      )
    const { outcome } = args
    const mapping = "result" in outcome ? outcome.mapping : undefined
    if (mapping) {
      const current = await ctx.db
        .query("guildBillingPrices")
        .withIndex("by_stripe_price_id", (q) =>
          q.eq("stripePriceId", mapping.priceId)
        )
        .unique()
      if (current && current.stripeProductId !== mapping.productId)
        throw new ConvexError("Price Product cannot change.")
      if (current)
        await ctx.db.patch(current._id, {
          enabled: true,
          updatedAt: Date.now(),
        })
      else
        await ctx.db.insert("guildBillingPrices", {
          stripeProductId: mapping.productId,
          stripePriceId: mapping.priceId,
          enabled: true,
          updatedAt: Date.now(),
        })
    }
    await ctx.db.patch(row._id, {
      ...("result" in outcome
        ? { result: outcome.result }
        : { rejection: outcome.rejection }),
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
      rejected: v.boolean(),
      canRetry: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const staff = await requireStaff(ctx)
    const pending = await ctx.db
      .query("billingCatalogueOperations")
      .withIndex("by_user_completed", (q) =>
        q.eq("userId", staff._id).eq("completedAt", undefined)
      )
      .first()
    const recent = await ctx.db
      .query("billingCatalogueOperations")
      .withIndex("by_created")
      .order("desc")
      .take(30)
    if (pending && !recent.some((row) => row._id === pending._id))
      recent.unshift(pending)
    return recent.map(
      ({ key, request, createdAt, completedAt, rejection, userId }) => ({
        key,
        request,
        createdAt,
        completedAt,
        rejected: rejection !== undefined,
        canRetry: userId === staff._id,
      })
    )
  },
})
