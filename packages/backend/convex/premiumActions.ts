"use node"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { v } from "convex/values"
import { action, internalAction, type ActionCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { backendEnv } from "@workspace/env/backend"
import { verifiedDiscordGuilds } from "./lib/communityDiscord"
import { verifyBotCanAccessDiscordGuild } from "./actions/dashboard/discord/lib/restAccess"
import {
  stripeCommunityConfig,
  stripeRequest,
  stripeSubscription,
  stripeInvoice,
  invoicePaidUntil,
  StripeRequestError,
} from "./lib/stripeCommunity"
import { verifyStripeSignature } from "./lib/integrationSecurity"

async function purchaseAuthority(ctx: ActionCtx, discordGuildId: string) {
  if (!/^\d{17,20}$/.test(discordGuildId))
    throw new Error("Select a valid Discord community.")
  const account = await ctx.runQuery(internal.communityRoles.account, {})
  const guilds = await verifiedDiscordGuilds(
    account.user.clerkUserId,
    account.discord.providerAccountId
  )
  const guild = guilds.find((g) => g.id === discordGuildId)
  const bot = await verifyBotCanAccessDiscordGuild(discordGuildId)
  if (
    !guild ||
    bot.status !== "ready" ||
    !backendEnv.CLEO_OFFICIAL_GUILD_ID ||
    discordGuildId === backendEnv.CLEO_OFFICIAL_GUILD_ID ||
    (!guild.owner && (BigInt(guild.permissions ?? "0") & 8n) === 0n)
  )
    throw new Error(
      "Fresh owner or Administrator permission in an independent Cleo-installed server is required."
    )
  return {
    ...account,
    purchaserKind: guild.owner
      ? ("owner" as const)
      : ("administrator" as const),
  }
}
export const checkout = action({
  args: {
    discordGuildId: v.string(),
    announce: v.boolean(),
    displayRole: v.boolean(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    stripeCommunityConfig(true)
    const account = await purchaseAuthority(ctx, args.discordGuildId)
    const context = await ctx.runQuery(internal.premiumPurchases.context, {
      userId: account.user._id,
      discordGuildId: args.discordGuildId,
    })
    if (
      !context.guild ||
      !context.price?.enabled ||
      !backendEnv.CLEO_DASHBOARD_ORIGIN
    )
      throw new Error("Guild Premium pricing is not configured.")
    const origin = new URL(backendEnv.CLEO_DASHBOARD_ORIGIN)
    if (
      origin.protocol !== "https:" ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("Billing return origin is not configured.")
    const reservation = await ctx.runMutation(
      internal.premiumPurchases.reserve,
      {
        ...args,
        userId: account.user._id,
        discordUserId: account.discord.providerAccountId,
        purchaserKind: account.purchaserKind,
        key: randomUUID(),
      }
    )
    if (reservation.url) return reservation.url
    const customerId =
      context.customer?.stripeCustomerId ??
      z
        .object({ id: z.string() })
        .parse(
          await stripeRequest(
            "/customers",
            { "metadata[cleo_user]": account.user._id },
            `cleo-customer:${account.user._id}`
          )
        ).id
    await ctx.runMutation(
      internal.mutations.internal.guildBilling.associateCustomer,
      { clerkUserId: account.user.clerkUserId, stripeCustomerId: customerId }
    )
    // Recheck immediately before the external Checkout creation, after reserving and resolving the customer.
    const fresh = await purchaseAuthority(ctx, args.discordGuildId)
    if (fresh.purchaserKind !== reservation.purchaserKind)
      throw new Error(
        "Your community authority changed. Wait for checkout reconciliation and try again."
      )
    await ctx.runMutation(internal.premiumPurchases.beginCheckout, {
      key: reservation.key,
    })
    const session = z
      .object({ id: z.string(), url: z.string().url(), expires_at: z.number() })
      .parse(
        await stripeRequest(
          "/checkout/sessions",
          {
            customer: customerId,
            mode: "subscription",
            "line_items[0][price]": context.price.stripePriceId,
            "line_items[0][quantity]": "1",
            "subscription_data[metadata][cleo_checkout]": reservation.key,
            "metadata[cleo_checkout]": reservation.key,
            success_url: `${origin.origin}/account/billing?checkout=returned`,
            cancel_url: `${origin.origin}/account/billing`,
            expires_at: String(Math.floor(reservation.expiresAt / 1000)),
          },
          `cleo-checkout:${reservation.key}`
        ).catch(async (error) => {
          // A validation rejection created no session. Timeouts, conflicts and
          // idempotency errors remain fenced until provider reconciliation.
          if (
            error instanceof StripeRequestError &&
            error.status === 400 &&
            error.type === "invalid_request_error"
          )
            await ctx.runMutation(internal.premiumPurchases.closeCheckout, {
              key: reservation.key,
            })
          throw error
        })
      )
    if (new URL(session.url).hostname !== "checkout.stripe.com")
      throw new Error("Unexpected Stripe Checkout location.")
    await ctx.runMutation(internal.premiumPurchases.checkoutCreated, {
      key: reservation.key,
      sessionId: session.id,
      url: session.url,
      expiresAt: session.expires_at * 1000,
    })
    return session.url
  },
})
export const portal = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    stripeCommunityConfig(true)
    const context = await ctx.runQuery(
      internal.premiumPurchases.billingUser,
      {}
    )
    if (!context.customer || !backendEnv.CLEO_DASHBOARD_ORIGIN)
      throw new Error("Your billing customer is unavailable.")
    const session = z.object({ url: z.string().url() }).parse(
      await stripeRequest("/billing_portal/sessions", {
        customer: context.customer.stripeCustomerId,
        return_url: `${new URL(backendEnv.CLEO_DASHBOARD_ORIGIN).origin}/account/billing`,
      })
    )
    if (new URL(session.url).hostname !== "billing.stripe.com")
      throw new Error("Unexpected Stripe billing location.")
    return session.url
  },
})
export const setCommunityConsent = action({
  args: { discordGuildId: v.string(), publishIdentity: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await purchaseAuthority(ctx, args.discordGuildId)
    return ctx.runMutation(internal.premiumPurchases.communityConsent, args)
  },
})
const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  livemode: z.boolean(),
  data: z.object({ object: z.unknown() }),
})
export const recoverCheckout = internalAction({
  args: { key: v.string(), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!backendEnv.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return null
    const reservation = await ctx.runQuery(
      internal.premiumPurchases.checkoutByKey,
      { key: args.key }
    )
    if (!reservation || reservation.closedAt !== undefined) return null
    if (!reservation.sessionId) {
      // The URL is returned only after persistence. An abandoned reservation without a
      // persisted session cannot have exposed a payable Checkout URL to the user.
      if (reservation.expiresAt + 60000 < Date.now())
        await ctx.runMutation(internal.premiumPurchases.closeCheckout, {
          key: args.key,
        })
      else
        await ctx.scheduler.runAfter(
          300000,
          internal.premiumActions.recoverCheckout,
          { ...args, attempt: Math.min(args.attempt + 1, 13) }
        )
      return null
    }
    try {
      const session = z
        .object({ status: z.string(), subscription: z.string().nullable() })
        .parse(
          await stripeRequest(
            `/checkout/sessions/${encodeURIComponent(reservation.sessionId)}`
          )
        )
      if (session.status === "expired") {
        await ctx.runMutation(internal.premiumPurchases.closeCheckout, {
          key: args.key,
        })
        return null
      }
      if (session.status === "complete" && session.subscription) {
        await ctx.runAction(internal.premiumActions.reconcile, {
          subscriptionId: session.subscription,
          eventId: `checkout-recovery:${reservation.sessionId}:${Math.floor(Date.now() / 300000)}`,
          revoked: false,
        })
        return null
      }
    } catch {
      /* Keep uncertain reservations fenced and retry at a capped frequency. */
    }
    await ctx.scheduler.runAfter(
      args.attempt < 12 ? 300000 : 3600000,
      internal.premiumActions.recoverCheckout,
      { ...args, attempt: Math.min(args.attempt + 1, 13) }
    )
    return null
  },
})
export const reconcileKnown = internalAction({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!backendEnv.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return null
    const page = await ctx.runMutation(
      internal.premiumPurchases.reconciliationPage,
      args
    )
    for (const subscriptionId of page.ids) {
      await ctx
        .runAction(internal.premiumActions.reconcile, {
          subscriptionId,
          eventId: `periodic:${subscriptionId}:${Math.floor(Date.now() / 300000)}`,
          revoked: false,
        })
        .catch(() => {})
    }
    if (page.cursor)
      await ctx.scheduler.runAfter(0, internal.premiumActions.reconcileKnown, {
        cursor: page.cursor,
      })
    return null
  },
})
export const webhook = internalAction({
  args: { body: v.string(), signature: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (
      !backendEnv.STRIPE_WEBHOOK_SECRET ||
      args.body.length > 262144 ||
      !verifyStripeSignature(
        args.body,
        args.signature,
        backendEnv.STRIPE_WEBHOOK_SECRET,
        Date.now()
      )
    )
      return false
    const event = eventSchema.parse(JSON.parse(args.body))
    if (event.livemode) return false
    let subscriptionId: string | undefined
    let paidInvoiceId: string | undefined
    let revoked = false
    if (event.type.startsWith("customer.subscription."))
      subscriptionId = z.object({ id: z.string() }).parse(event.data.object).id
    else if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    )
      subscriptionId =
        z
          .object({ subscription: z.string().nullable() })
          .parse(event.data.object).subscription ?? undefined
    else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed"
    ) {
      const invoice = stripeInvoice.parse(event.data.object)
      subscriptionId =
        invoice.parent?.subscription_details?.subscription ??
        invoice.subscription
      if (event.type === "invoice.paid") paidInvoiceId = invoice.id
    } else if (
      event.type === "charge.refunded" ||
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.closed"
    ) {
      const object = z
        .object({
          id: z.string(),
          charge: z.string().optional(),
          payment_intent: z.string().nullable().optional(),
        })
        .parse(event.data.object)
      subscriptionId =
        (await ctx.runQuery(internal.premiumPurchases.paymentSubscription, {
          chargeId:
            event.type === "charge.refunded" ? object.id : object.charge,
          paymentIntentId: object.payment_intent ?? undefined,
        })) ?? undefined
      if (!subscriptionId) {
        const chargeId =
          event.type === "charge.refunded" ? object.id : object.charge
        if (!chargeId) throw new Error("Charge identity required.")
        const charge = z
          .object({ id: z.string(), customer: z.string().nullable() })
          .parse(
            await stripeRequest(`/charges/${encodeURIComponent(chargeId)}`)
          )
        if (charge.id !== chargeId) throw new Error("Charge identity mismatch.")
        if (
          charge.customer &&
          (await ctx.runQuery(
            internal.premiumPurchases.managedPaymentCustomer,
            { customerId: charge.customer }
          ))
        )
          throw new Error(
            "Known customer payment association requires reconciliation."
          )
        return true
      }
      revoked = true
    } else return true
    if (!subscriptionId) return true
    await ctx.runAction(internal.premiumActions.reconcile, {
      subscriptionId,
      eventId: event.id,
      paidInvoiceId,
      revoked,
    })
    return true
  },
})
export const reconcile = internalAction({
  args: {
    subscriptionId: v.string(),
    eventId: v.string(),
    paidInvoiceId: v.optional(v.string()),
    revoked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const worker = randomUUID()
    if (
      !(await ctx.runMutation(internal.premiumPurchases.acquire, {
        subscriptionId: args.subscriptionId,
        worker,
      }))
    )
      throw new Error("Subscription reconciliation in progress.")
    try {
      const rawSubscription = await stripeRequest(
        `/subscriptions/${encodeURIComponent(args.subscriptionId)}`
      )
      const identity = z
        .object({
          id: z.string(),
          metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        })
        .parse(rawSubscription)
      if (identity.id !== args.subscriptionId)
        throw new Error("Subscription identity mismatch.")
      if (identity.metadata?.cleo_checkout === undefined) return null
      const subscription = stripeSubscription.parse(rawSubscription)
      const item = subscription.items.data[0]
      if (!item) throw new Error("Subscription price unavailable.")
      let paidInvoice:
        | {
            id: string
            paidUntil: number
            payments: { paymentIntentId: string; chargeId: string }[]
          }
        | undefined
      let paymentReversed = false
      const invoiceId = args.paidInvoiceId ?? subscription.latest_invoice
      if (invoiceId) {
        const invoice = stripeInvoice.parse(
          await stripeRequest(
            `/invoices/${encodeURIComponent(invoiceId)}?expand[]=payments`
          )
        )
        const paidUntil = invoicePaidUntil(
          invoice,
          subscription.id,
          item.current_period_end
        )
        if (
          invoice.id !== invoiceId ||
          (invoice.status === "paid" &&
            invoice.amount_paid > 0 &&
            paidUntil === undefined)
        )
          throw new Error("Complete paid invoice coverage evidence required.")
        if (paidUntil !== undefined) {
          if (!invoice.payments || invoice.payments.has_more)
            throw new Error("Complete invoice payment evidence required.")
          const successful = invoice.payments.data.filter(
            (payment) => payment.status === "paid"
          )
          if (
            !successful.length ||
            successful.some(
              (entry) =>
                entry.amount_paid === null ||
                entry.amount_paid <= 0 ||
                entry.payment.type !== "payment_intent" ||
                !entry.payment.payment_intent
            )
          )
            throw new Error("Verified successful Stripe payment required.")
          const payments = await Promise.all(
            successful.map(async (entry) => {
              const paymentIntentId = entry.payment.payment_intent!
              const payment = z
                .object({
                  status: z.string(),
                  customer: z.string(),
                  amount_received: z.number().int(),
                  latest_charge: z.string().nullable(),
                })
                .parse(
                  await stripeRequest(
                    `/payment_intents/${encodeURIComponent(paymentIntentId)}`
                  )
                )
              if (
                payment.status !== "succeeded" ||
                payment.customer !== subscription.customer ||
                payment.amount_received <= 0 ||
                !payment.latest_charge
              )
                throw new Error("Verified successful Stripe payment required.")
              const charge = z
                .object({
                  customer: z.string(),
                  payment_intent: z.string(),
                  paid: z.boolean(),
                  refunded: z.boolean(),
                  disputed: z.boolean(),
                  amount_refunded: z.number().int(),
                })
                .parse(
                  await stripeRequest(
                    `/charges/${encodeURIComponent(payment.latest_charge)}`
                  )
                )
              if (
                charge.customer !== subscription.customer ||
                charge.payment_intent !== paymentIntentId ||
                !charge.paid
              )
                throw new Error("Charge identity verification failed.")
              paymentReversed ||=
                charge.refunded || charge.disputed || charge.amount_refunded > 0
              return { paymentIntentId, chargeId: payment.latest_charge }
            })
          )
          if (payments.length)
            paidInvoice = { id: invoice.id, paidUntil, payments }
        }
      }
      await ctx.runMutation(internal.premiumPurchases.apply, {
        eventId: args.eventId,
        worker,
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        checkoutKey: subscription.metadata.cleo_checkout,
        productId: item.price.product,
        priceId: item.price.id,
        status: subscription.status,
        startsAt: item.current_period_start * 1000,
        endsAt: item.current_period_end * 1000,
        trialEndsAt: subscription.trial_end
          ? subscription.trial_end * 1000
          : undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        revoked: args.revoked || paymentReversed,
        testMode: true,
        paidInvoice,
      })
      return null
    } finally {
      await ctx.runMutation(internal.premiumPurchases.release, {
        subscriptionId: args.subscriptionId,
        worker,
      })
    }
  },
})
