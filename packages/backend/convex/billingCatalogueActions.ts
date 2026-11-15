"use node"

import { randomUUID } from "node:crypto"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { z } from "zod"
import { v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { action, type ActionCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { stripeRequest } from "./lib/stripeCommunity"
import {
  catalogueChange,
  catalogueProduct,
  cataloguePrice,
  requireCatalogueSessionClaims,
} from "./lib/billingCatalogueModels"

const product = z.object({
  id: z.string(),
  livemode: z.literal(false),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  default_price: z.string().nullable(),
})
const price = z.object({
  id: z.string(),
  livemode: z.literal(false),
  product: z.string(),
  active: z.boolean(),
  unit_amount: z.number().int().nullable(),
  currency: z.string(),
  recurring: z
    .object({
      interval: z.string(),
      interval_count: z.number(),
      usage_type: z.string(),
    })
    .nullable(),
})
async function account(ctx: ActionCtx, write = false) {
  const authority = await ctx.runQuery(internal.billingCatalogue.authority, {
    write,
  })
  const result = z
    .object({ id: z.string() })
    .parse(await stripeRequest("/account"))
  // Explicitly pin this implementation to Cleo's owned Dev Sandbox. A live key is rejected by stripeRequest too.
  if (
    result.id !== "acct_1RGgwvE1e1YdqDQQ" ||
    result.id !== backendEnv.STRIPE_EXPECTED_ACCOUNT_ID
  )
    throw new Error("Cleo Dev Sandbox account is required for this catalogue.")
  return { ...authority, accountId: result.id }
}
function productView(row: z.infer<typeof product>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    defaultPrice: row.default_price,
  }
}
export const list = action({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    accountId: v.string(),
    products: v.array(catalogueProduct),
    next: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const authority = await account(ctx)
    const params = new URLSearchParams({ limit: "50" })
    if (args.cursor)
      params.set(
        "starting_after",
        z
          .string()
          .regex(/^prod_[A-Za-z0-9]+$/)
          .parse(args.cursor)
      )
    const rows = z
      .object({ data: z.array(product), has_more: z.boolean() })
      .parse(await stripeRequest(`/products?${params}`))
    return {
      accountId: authority.accountId,
      products: rows.data.map(productView),
      next: rows.has_more ? (rows.data.at(-1)?.id ?? null) : null,
    }
  },
})
export const detail = action({
  args: { productId: v.string(), cursor: v.optional(v.string()) },
  returns: v.object({
    product: catalogueProduct,
    prices: v.array(cataloguePrice),
    next: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await account(ctx)
    const id = z
      .string()
      .regex(/^prod_[A-Za-z0-9]+$/)
      .parse(args.productId)
    const params = new URLSearchParams({ product: id, limit: "100" })
    if (args.cursor)
      params.set(
        "starting_after",
        z
          .string()
          .regex(/^price_[A-Za-z0-9]+$/)
          .parse(args.cursor)
      )
    const [raw, rawPrices, mappings] = await Promise.all([
      stripeRequest(`/products/${id}`),
      stripeRequest(`/prices?${params}`),
      ctx.runQuery(internal.billingCatalogue.mappings, {}),
    ])
    const row = product.parse(raw)
    if (row.id !== id) throw new Error("Product identity mismatch.")
    const rows = z
      .object({ data: z.array(price), has_more: z.boolean() })
      .parse(rawPrices)
    if (rows.data.some((entry) => entry.product !== id))
      throw new Error("Price Product mismatch.")
    return {
      product: productView(row),
      prices: rows.data.map((entry) => ({
        id: entry.id,
        active: entry.active,
        amount: entry.unit_amount,
        currency: entry.currency,
        interval: entry.recurring?.interval ?? null,
        intervalCount: entry.recurring?.interval_count ?? 1,
        approved: mappings.some(
          (mapping) => mapping.priceId === entry.id && mapping.productId === id
        ),
      })),
      next: rows.has_more ? (rows.data.at(-1)?.id ?? null) : null,
    }
  },
})
export const change = action({
  args: {
    key: v.string(),
    request: v.string(),
    sessionToken: v.string(),
    confirmation: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const key = z.uuid().parse(args.key)
    if (args.request.length > 4096 || args.sessionToken.length > 16384)
      throw new Error("Request exceeds bounds.")
    const change = catalogueChange.parse(JSON.parse(args.request))
    if (args.confirmation !== "CONFIRM SANDBOX CHANGE")
      throw new Error("Explicit sandbox confirmation is required.")
    const authority = await account(ctx, true)
    const issuer = backendEnv.CLERK_JWT_ISSUER_DOMAIN
    if (!issuer || !issuer.startsWith("https://"))
      throw new Error("Clerk session verification is unavailable.")
    const { payload } = await jwtVerify(
      args.sessionToken,
      createRemoteJWKSet(
        new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks.json`)
      ),
      { issuer, algorithms: ["RS256"] }
    )
    requireCatalogueSessionClaims(
      payload,
      authority,
      Math.floor(Date.now() / 1000)
    )
    const worker = randomUUID()
    const previous = await ctx.runMutation(internal.billingCatalogue.claim, {
      key,
      request: JSON.stringify(change),
      accountId: authority.accountId,
      worker,
    })
    if (previous !== null) return previous
    let result: string
    let mapping: { productId: string; priceId: string } | undefined
    const idempotency = `cleo-catalogue:${authority.accountId}:${authority.clerkUserId}:${key}`
    if (change.kind === "createProduct") {
      const row = product.parse(
        await stripeRequest(
          "/products",
          { name: change.name, description: change.description },
          idempotency
        )
      )
      result = row.id
    } else {
      const current = product.parse(
        await stripeRequest(`/products/${change.productId}`)
      )
      if (current.id !== change.productId)
        throw new Error("Product identity mismatch.")
      if (change.kind === "editProduct" || change.kind === "archiveProduct") {
        const row = product.parse(
          await stripeRequest(
            `/products/${current.id}`,
            change.kind === "editProduct"
              ? { name: change.name, description: change.description }
              : { active: "false" },
            idempotency
          )
        )
        if (row.id !== current.id) throw new Error("Product identity mismatch.")
        result = row.id
      } else if (change.kind === "createPrice") {
        if (!current.active)
          throw new Error(
            "Restore the product in Stripe before adding a price."
          )
        const row = price.parse(
          await stripeRequest(
            "/prices",
            {
              product: current.id,
              currency: change.currency,
              unit_amount: String(change.amount),
              ...(change.interval === "one_time"
                ? {}
                : {
                    "recurring[interval]": change.interval,
                    "recurring[interval_count]": String(change.intervalCount),
                    "recurring[usage_type]": "licensed",
                  }),
            },
            idempotency
          )
        )
        if (row.product !== current.id)
          throw new Error("Price Product mismatch.")
        result = row.id
      } else {
        const existing = price.parse(
          await stripeRequest(`/prices/${change.priceId}`)
        )
        if (existing.id !== change.priceId || existing.product !== current.id)
          throw new Error("Price Product mismatch.")
        if (change.kind === "archivePrice") {
          if (current.default_price === existing.id)
            throw new Error(
              "Choose another default before archiving this price."
            )
          const archived = price.parse(
            await stripeRequest(
              `/prices/${existing.id}`,
              { active: "false" },
              idempotency
            )
          )
          if (archived.id !== existing.id || archived.product !== current.id)
            throw new Error("Archived Price identity mismatch.")
        } else {
          if (!existing.active || !current.active)
            throw new Error("An active Product and Price are required.")
          if (change.kind === "defaultPrice") {
            const updated = product.parse(
              await stripeRequest(
                `/products/${current.id}`,
                { default_price: existing.id },
                idempotency
              )
            )
            if (
              updated.id !== current.id ||
              updated.default_price !== existing.id
            )
              throw new Error("Default Price was not confirmed.")
          } else {
            if (
              !existing.recurring ||
              existing.recurring.usage_type !== "licensed" ||
              !existing.unit_amount ||
              existing.unit_amount <= 0
            )
              throw new Error(
                "Premium mapping requires a positive licensed recurring price."
              )
            mapping = { productId: current.id, priceId: existing.id }
          }
        }
        result = existing.id
      }
    }
    await ctx.runMutation(internal.billingCatalogue.complete, {
      key,
      worker,
      result,
      mapping,
    })
    return result
  },
})
