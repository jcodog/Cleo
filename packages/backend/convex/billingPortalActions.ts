"use node"

import { z } from "zod"
import { ConvexError, v } from "convex/values"
import { billingOrigin } from "./lib/billingOrigin"
import { action, type ActionCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { stripeRequest, verifyStripeAccount } from "./lib/stripeCommunity"
import {
  billingAddress,
  billingInvoice,
  billingMethod,
  billingSubscription,
  stripeBillingSubscription,
  methodId,
  methodSummary,
  operationKey,
  setupId,
  setupIntent,
  stripeBillingUrl,
  stripeCustomer,
  stripeInvoiceSummary,
  stripeMethod,
} from "./lib/billingPortalModels"

async function purchaser(ctx: ActionCtx) {
  const context = await ctx.runQuery(internal.premiumPurchases.billingUser, {})
  await verifyStripeAccount()
  return context
}
async function customerFor(ctx: ActionCtx) {
  const context = await purchaser(ctx)
  if (context.customer)
    return { ...context, customerId: context.customer.stripeCustomerId }
  const customer = z
    .object({ id: z.string(), livemode: z.literal(false) })
    .parse(
      await stripeRequest(
        "/customers",
        { email: context.user.email, "metadata[cleo_user]": context.user._id },
        `cleo-customer:${context.user._id}`
      )
    )
  await ctx.runMutation(
    internal.mutations.internal.guildBilling.associateCustomer,
    { clerkUserId: context.user.clerkUserId, stripeCustomerId: customer.id }
  )
  return { ...context, customerId: customer.id }
}
async function ownMethod(customerId: string, id: string) {
  const method = stripeMethod.parse(
    await stripeRequest(
      `/payment_methods/${encodeURIComponent(methodId.parse(id))}`
    )
  )
  if (method.id !== id || method.customer !== customerId)
    throw new ConvexError(
      "This payment method does not belong to your billing account."
    )
  return method
}
async function setCustomerDefault(customerId: string, id: string, key: string) {
  await ownMethod(customerId, id)
  await stripeRequest(
    `/customers/${encodeURIComponent(customerId)}`,
    { "invoice_settings[default_payment_method]": id },
    key
  )
}

/** Stripe supplies billing data. Convex's verified ledger alone supplies entitlements. */
export const profile = action({
  args: {},
  returns: v.object({
    clerkUserId: v.string(),
    customer: v.union(
      v.null(),
      v.object({
        name: v.string(),
        email: v.string(),
        address: billingAddress,
        defaultMethodId: v.union(v.string(), v.null()),
      })
    ),
    methods: v.array(billingMethod),
    hasMoreMethods: v.boolean(),
    invoices: v.array(billingInvoice),
    hasMoreInvoices: v.boolean(),
    subscriptions: v.array(billingSubscription),
    hasMoreSubscriptions: v.boolean(),
  }),
  handler: async (ctx) => {
    const context = await ctx.runQuery(
      internal.premiumPurchases.billingUser,
      {}
    )
    if (!context.customer)
      return {
        clerkUserId: context.user.clerkUserId,
        customer: null,
        methods: [],
        hasMoreMethods: false,
        invoices: [],
        hasMoreInvoices: false,
        subscriptions: [],
        hasMoreSubscriptions: false,
      }
    await verifyStripeAccount()
    const id = context.customer.stripeCustomerId
    const [rawCustomer, rawMethods, rawInvoices, rawSubscriptions] =
      await Promise.all([
        stripeRequest(
          `/customers/${encodeURIComponent(id)}?expand[]=default_source`
        ),
        stripeRequest(
          `/customers/${encodeURIComponent(id)}/payment_methods?limit=100`
        ),
        stripeRequest(`/invoices?customer=${encodeURIComponent(id)}&limit=12`),
        stripeRequest(
          `/subscriptions?customer=${encodeURIComponent(id)}&status=all&limit=25&expand[]=data.items.data.price.product`
        ),
      ])
    const customer = stripeCustomer.parse(rawCustomer)
    const methods = z
      .object({ data: z.array(stripeMethod).max(100), has_more: z.boolean() })
      .parse(rawMethods)
    const invoices = z
      .object({
        data: z.array(stripeInvoiceSummary).max(12),
        has_more: z.boolean(),
      })
      .parse(rawInvoices)
    const subscriptions = z
      .object({
        data: z.array(stripeBillingSubscription).max(25),
        has_more: z.boolean(),
      })
      .parse(rawSubscriptions)
    if (
      customer.id !== id ||
      methods.data.some((row) => row.customer !== id) ||
      invoices.data.some((row) => row.customer !== id) ||
      subscriptions.data.some((row) => row.customer !== id)
    )
      throw new ConvexError(
        "Stripe billing account identity could not be verified."
      )
    // A default can be absent from the first page of saved methods.
    const defaultId = customer.invoice_settings.default_payment_method
    if (defaultId && !methods.data.some((row) => row.id === defaultId))
      methods.data.unshift(await ownMethod(id, defaultId))
    const summaries = methods.data.map(methodSummary)
    const source = customer.default_source
    if (typeof source === "string")
      throw new ConvexError(
        "Your saved legacy payment method could not be loaded. Please contact support."
      )
    if (typeof source === "object" && source)
      summaries.push({
        id: source.id,
        type: source.object,
        label: source.brand ? `${source.brand} card` : "Saved payment method",
        last4: source.last4 ?? null,
        brand: source.brand ?? null,
        expiryMonth: source.exp_month ?? null,
        expiryYear: source.exp_year ?? null,
        manageable: false,
      })
    return {
      clerkUserId: context.user.clerkUserId,
      customer: {
        name: customer.name ?? "",
        email: customer.email ?? "",
        defaultMethodId:
          defaultId ??
          (typeof source === "string" ? source : source?.id) ??
          null,
        address: {
          line1: customer.address?.line1 ?? "",
          line2: customer.address?.line2 ?? "",
          city: customer.address?.city ?? "",
          state: customer.address?.state ?? "",
          postalCode: customer.address?.postal_code ?? "",
          country: customer.address?.country ?? "",
        },
      },
      methods: summaries,
      hasMoreMethods: methods.has_more,
      invoices: invoices.data.map((row) => ({
        id: row.id,
        number: row.number,
        createdAt: row.created * 1000,
        amount: row.total,
        currency: row.currency,
        status: row.status ?? "draft",
        url: stripeBillingUrl(row.hosted_invoice_url),
        pdf: stripeBillingUrl(row.invoice_pdf),
      })),
      hasMoreInvoices: invoices.has_more,
      subscriptions: subscriptions.data.map((row) => {
        if (row.items.has_more)
          throw new ConvexError(
            "This subscription has more items than can be displayed. Open subscription management for its full details."
          )
        const periods = row.items.data.flatMap((item) =>
          item.current_period_end === undefined ? [] : [item.current_period_end]
        )
        return {
          id: row.id,
          status: row.status,
          cancelAtPeriodEnd: row.cancel_at_period_end,
          periodEnd: periods.length ? Math.min(...periods) * 1000 : null,
          items: row.items.data.map((item) => ({
            name:
              typeof item.price.product === "string"
                ? "Subscription"
                : (item.price.product.name ?? "Subscription"),
            amount: item.price.unit_amount,
            currency: item.price.currency,
            quantity: item.quantity ?? 1,
            interval: item.price.recurring?.interval ?? null,
            intervalCount: item.price.recurring?.interval_count ?? 1,
          })),
        }
      }),
      hasMoreSubscriptions: subscriptions.has_more,
    }
  },
})

export const beginSetup = action({
  args: { key: v.string(), returnOrigin: v.optional(v.string()) },
  returns: v.object({
    id: v.string(),
    clientSecret: v.string(),
    returnUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    const key = operationKey.parse(args.key)
    const url = `${billingOrigin(args.returnOrigin)}/billing`
    const context = await customerFor(ctx)
    const intent = setupIntent.parse(
      await stripeRequest(
        "/setup_intents",
        {
          customer: context.customerId,
          usage: "off_session",
          "automatic_payment_methods[enabled]": "true",
          "metadata[cleo_user]": context.user._id,
        },
        `cleo-method:${context.user._id}:${key}`
      )
    )
    if (
      intent.customer !== context.customerId ||
      intent.metadata.cleo_user !== context.user._id ||
      !intent.client_secret
    )
      throw new ConvexError(
        "Secure payment-method setup could not be verified."
      )
    return { id: intent.id, clientSecret: intent.client_secret, returnUrl: url }
  },
})
export const completeSetup = action({
  args: { setupIntentId: v.string() },
  returns: v.union(v.literal("saved"), v.literal("processing")),
  handler: async (ctx, args) => {
    const context = await purchaser(ctx)
    if (!context.customer)
      throw new ConvexError("Your billing account is unavailable.")
    const id = setupId.parse(args.setupIntentId)
    const intent = setupIntent.parse(
      await stripeRequest(`/setup_intents/${encodeURIComponent(id)}`)
    )
    if (
      intent.id !== id ||
      intent.customer !== context.customer.stripeCustomerId ||
      intent.metadata.cleo_user !== context.user._id
    )
      throw new ConvexError(
        "This payment setup does not belong to your account."
      )
    if (intent.status === "processing") return "processing"
    if (intent.status !== "succeeded" || !intent.payment_method)
      throw new ConvexError("The payment method has not been saved. Try again.")
    await setCustomerDefault(
      context.customer.stripeCustomerId,
      intent.payment_method,
      `cleo-method-default:${id}`
    )
    return "saved"
  },
})
export const cancelSetup = action({
  args: { setupIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await purchaser(ctx)
    if (!context.customer)
      throw new ConvexError("Your billing account is unavailable.")
    const id = setupId.parse(args.setupIntentId)
    const intent = setupIntent.parse(
      await stripeRequest(`/setup_intents/${encodeURIComponent(id)}`)
    )
    if (
      intent.id !== id ||
      intent.customer !== context.customer.stripeCustomerId ||
      intent.metadata.cleo_user !== context.user._id
    )
      throw new ConvexError(
        "This payment setup does not belong to your account."
      )
    if (!["succeeded", "canceled", "processing"].includes(intent.status))
      await stripeRequest(
        `/setup_intents/${encodeURIComponent(id)}/cancel`,
        {},
        `cleo-cancel-setup:${id}`
      )
    return null
  },
})
export const makeDefault = action({
  args: { paymentMethodId: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = operationKey.parse(args.key),
      id = methodId.parse(args.paymentMethodId)
    const context = await purchaser(ctx)
    if (!context.customer)
      throw new ConvexError("Your billing account is unavailable.")
    await setCustomerDefault(
      context.customer.stripeCustomerId,
      id,
      `cleo-default:${context.user._id}:${key}`
    )
    return null
  },
})
export const removeMethod = action({
  args: { paymentMethodId: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = operationKey.parse(args.key),
      id = methodId.parse(args.paymentMethodId)
    const context = await purchaser(ctx)
    if (!context.customer)
      throw new ConvexError("Your billing account is unavailable.")
    const customerId = context.customer.stripeCustomerId
    await ownMethod(customerId, id)
    const customer = stripeCustomer.parse(
      await stripeRequest(`/customers/${encodeURIComponent(customerId)}`)
    )
    // Require an explicit replacement instead of leaving automatic invoices without their default.
    if (customer.invoice_settings.default_payment_method === id)
      throw new ConvexError(
        "Choose another default payment method before removing this one."
      )
    const subscriptions = z
      .object({
        data: z.array(
          z.object({
            customer: z.string(),
            status: z.string(),
            default_payment_method: z.string().nullable(),
          })
        ),
        has_more: z.boolean(),
      })
      .parse(
        await stripeRequest(
          `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`
        )
      )
    if (
      subscriptions.has_more ||
      subscriptions.data.some(
        (row) =>
          row.customer !== customerId ||
          (!["canceled", "incomplete_expired"].includes(row.status) &&
            row.default_payment_method === id)
      )
    )
      throw new ConvexError(
        "A subscription uses this payment method. Update that subscription before removing it."
      )
    await stripeRequest(
      `/payment_methods/${encodeURIComponent(id)}/detach`,
      {},
      `cleo-remove:${context.user._id}:${key}`
    )
    return null
  },
})
export const updateDetails = action({
  args: {
    key: v.string(),
    name: v.string(),
    email: v.string(),
    address: billingAddress,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = operationKey.parse(args.key)
    const details = z
      .object({
        name: z.string().trim().min(1).max(150),
        email: z.email().max(254),
        address: z.object({
          line1: z.string().trim().min(1).max(200),
          line2: z.string().max(200),
          city: z.string().trim().min(1).max(100),
          state: z.string().max(100),
          postalCode: z.string().max(32),
          country: z.string().regex(/^[A-Z]{2}$/),
        }),
      })
      .parse(args)
    const context = await customerFor(ctx)
    await stripeRequest(
      `/customers/${encodeURIComponent(context.customerId)}`,
      {
        name: details.name,
        email: details.email,
        "address[line1]": details.address.line1,
        "address[line2]": details.address.line2,
        "address[city]": details.address.city,
        "address[state]": details.address.state,
        "address[postal_code]": details.address.postalCode,
        "address[country]": details.address.country,
      },
      `cleo-details:${context.user._id}:${key}`
    )
    return null
  },
})
