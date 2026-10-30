"use node"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { v } from "convex/values"
import { action, internalAction, type ActionCtx } from "./_generated/server"
import { api, internal } from "./_generated/api"
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
  verifyStripeAccount,
} from "./lib/stripeCommunity"
import { verifyStripeSignature } from "./lib/integrationSecurity"
import { approvedCheckoutPrice, checkoutSession } from "./lib/stripeCheckout"

const offerValue = v.object({
  name: v.string(),
  unitAmount: v.number(),
  currency: v.string(),
  interval: v.union(
    v.literal("day"),
    v.literal("week"),
    v.literal("month"),
    v.literal("year")
  ),
  intervalCount: v.number(),
  guildName: v.string(),
  email: v.string(),
})

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
    (!guild.owner && (BigInt(guild.permissions ?? "0") & 8n) === 0n)
  )
    throw new Error(
      "Fresh owner or Administrator permission in a Cleo-installed server is required."
    )
  return {
    ...account,
    purchaserKind: guild.owner
      ? ("owner" as const)
      : ("administrator" as const),
  }
}
export const offer = action({
  args: { discordGuildId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      unitAmount: v.number(),
      currency: v.string(),
      interval: v.union(
        v.literal("day"),
        v.literal("week"),
        v.literal("month"),
        v.literal("year")
      ),
      intervalCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const view = await ctx.runQuery(api.premiumPurchases.view, args)
    if (!view.guildPremium) return null
    const { user } = await ctx.runQuery(
      internal.premiumPurchases.billingUser,
      {}
    )
    const { price } = await ctx.runQuery(internal.premiumPurchases.context, {
      userId: user._id,
      discordGuildId: args.discordGuildId,
    })
    if (!price?.enabled) return null
    return approvedCheckoutPrice(price.stripePriceId, price.stripeProductId)
  },
})
export const checkout = action({
  args: {
    discordGuildId: v.string(),
    announce: v.boolean(),
    displayRole: v.boolean(),
  },
  returns: v.object({
    clientSecret: v.string(),
    sessionId: v.string(),
    expiresAt: v.number(),
    offer: offerValue,
  }),
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
    const price = await approvedCheckoutPrice(
      context.price.stripePriceId,
      context.price.stripeProductId
    )
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
    const customerId =
      context.customer?.stripeCustomerId ??
      z.object({ id: z.string() }).parse(
        await stripeRequest(
          "/customers",
          {
            "metadata[cleo_user]": account.user._id,
            email: account.user.email,
          },
          `cleo-customer:${account.user._id}`
        )
      ).id
    await ctx.runMutation(
      internal.mutations.internal.guildBilling.associateCustomer,
      { clerkUserId: account.user.clerkUserId, stripeCustomerId: customerId }
    )
    if (reservation.sessionId) {
      const session = checkoutSession.parse(
        await stripeRequest(
          `/checkout/sessions/${encodeURIComponent(reservation.sessionId)}`
        )
      )
      if (
        session.id !== reservation.sessionId ||
        session.customer !== customerId ||
        session.status !== "open" ||
        !session.client_secret ||
        session.expires_at * 1000 <= Date.now()
      )
        throw new Error(
          "This checkout is no longer payable. Check My billing before trying again."
        )
      const lines = z
        .object({
          data: z
            .array(z.object({ price: z.object({ id: z.string() }) }))
            .length(1),
          has_more: z.literal(false),
        })
        .parse(
          await stripeRequest(
            `/checkout/sessions/${encodeURIComponent(session.id)}/line_items`
          )
        )
      if (lines.data[0]?.price.id !== context.price.stripePriceId)
        throw new Error(
          "The reserved checkout uses a different price. Cancel it before starting again."
        )
      return {
        clientSecret: session.client_secret,
        sessionId: session.id,
        expiresAt: session.expires_at * 1000,
        offer: {
          ...price,
          guildName: context.guild.name,
          email: account.user.email,
        },
      }
    }
    // Recheck immediately before the external Checkout creation, after reserving and resolving the customer.
    const fresh = await purchaseAuthority(ctx, args.discordGuildId)
    if (fresh.purchaserKind !== reservation.purchaserKind)
      throw new Error(
        "Your community authority changed. Wait for checkout reconciliation and try again."
      )
    await ctx.runMutation(internal.premiumPurchases.beginCheckout, {
      key: reservation.key,
    })
    const session = checkoutSession.parse(
      await stripeRequest(
        "/checkout/sessions",
        {
          customer: customerId,
          mode: "subscription",
          ui_mode: "elements",
          integration_identifier: `cleo_elements_${reservation.key
            .replaceAll("-", "")
            .slice(0, 8)
            .split("")
            .map((character) =>
              String.fromCharCode(97 + parseInt(character, 16))
            )
            .join("")}`,
          "line_items[0][price]": context.price.stripePriceId,
          "line_items[0][quantity]": "1",
          "subscription_data[metadata][cleo_checkout]": reservation.key,
          "metadata[cleo_checkout]": reservation.key,
          return_url: `${origin.origin}/dashboard/${args.discordGuildId}/checkout?session_id={CHECKOUT_SESSION_ID}`,
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
    if (
      session.customer !== customerId ||
      session.status !== "open" ||
      !session.client_secret
    )
      throw new Error("Stripe did not return a payable test Checkout Session.")
    await ctx.runMutation(internal.premiumPurchases.checkoutCreated, {
      key: reservation.key,
      sessionId: session.id,
      expiresAt: session.expires_at * 1000,
    })
    return {
      clientSecret: session.client_secret,
      sessionId: session.id,
      expiresAt: session.expires_at * 1000,
      offer: {
        ...price,
        guildName: context.guild.name,
        email: account.user.email,
      },
    }
  },
})
export const portal = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    stripeCommunityConfig()
    const context = await ctx.runQuery(
      internal.premiumPurchases.billingUser,
      {}
    )
    if (!context.customer || !backendEnv.CLEO_DASHBOARD_ORIGIN)
      throw new Error("Your billing customer is unavailable.")
    await verifyStripeAccount()
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

async function purchaserCheckout(
  ctx: ActionCtx,
  args: { discordGuildId: string; sessionId: string }
) {
  stripeCommunityConfig()
  const billing = await ctx.runQuery(internal.premiumPurchases.billingUser, {})
  const reservation = await ctx.runQuery(
    internal.premiumPurchases.checkoutBySession,
    { sessionId: args.sessionId }
  )
  const context = await ctx.runQuery(internal.premiumPurchases.context, {
    userId: billing.user._id,
    discordGuildId: args.discordGuildId,
  })
  if (
    !reservation ||
    reservation.userId !== billing.user._id ||
    reservation.guildId !== context.guild?._id ||
    !billing.customer
  )
    throw new Error(
      "This checkout does not belong to your billing account and community."
    )
  const session = checkoutSession.parse(
    await stripeRequest(
      `/checkout/sessions/${encodeURIComponent(args.sessionId)}`
    )
  )
  if (
    session.id !== args.sessionId ||
    session.customer !== billing.customer.stripeCustomerId
  )
    throw new Error("Checkout customer identity mismatch.")
  return { reservation, session, guildName: context.guild.name }
}

export const checkoutStatus = action({
  args: { discordGuildId: v.string(), sessionId: v.string() },
  returns: v.object({
    status: v.string(),
    paymentStatus: v.string(),
    guildName: v.string(),
  }),
  handler: async (ctx, args) => {
    const { session, guildName } = await purchaserCheckout(ctx, args)
    return {
      status: session.status,
      paymentStatus: session.payment_status,
      guildName,
    }
  },
})

/** Close the Stripe session before releasing the reservation, including races with confirmation. */
export const cancelCheckout = action({
  args: { discordGuildId: v.string(), sessionId: v.string() },
  returns: v.union(v.literal("expired"), v.literal("complete")),
  handler: async (ctx, args) => {
    const { reservation, session } = await purchaserCheckout(ctx, args)
    if (session.status === "complete") return "complete" as const
    if (session.status === "open") {
      const expired = z
        .object({ id: z.string(), status: z.literal("expired") })
        .parse(
          await stripeRequest(
            `/checkout/sessions/${encodeURIComponent(session.id)}/expire`,
            {},
            `cleo-expire:${session.id}`
          )
        )
      if (expired.id !== session.id)
        throw new Error("Checkout identity mismatch.")
    }
    await ctx.runMutation(internal.premiumPurchases.closeCheckout, {
      key: reservation.key,
    })
    return "expired" as const
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
      // The client secret is returned only after persistence. An abandoned reservation
      // without a persisted session cannot have exposed a payable form to the user.
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
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
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
      event.type === "charge.dispute.closed" ||
      event.type === "radar.early_fraud_warning.created"
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
    } else if (event.type === "checkout.session.expired") {
      const session = z.object({ id: z.string() }).parse(event.data.object)
      const reservation = await ctx.runQuery(
        internal.premiumPurchases.checkoutBySession,
        { sessionId: session.id }
      )
      if (reservation)
        await ctx.runMutation(internal.premiumPurchases.closeCheckout, {
          key: reservation.key,
        })
      return true
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
      const invoiceId = subscription.latest_invoice ?? args.paidInvoiceId
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
