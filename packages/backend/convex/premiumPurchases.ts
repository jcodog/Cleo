import { v, ConvexError } from "convex/values"
import {
  internalMutation,
  internalQuery,
  query,
  mutation,
} from "./_generated/server"
import { requireCurrentUser, requireDiscordGuildManager } from "./lib/auth"
import { getGuildAccess } from "./lib/guildEntitlements"
import { nextSubscriptionReconciliation } from "./lib/communityReconciliation"
import { queueRoleSync } from "./lib/cleoRoleEligibility"
import { backendEnv } from "@workspace/env/backend"
import { subscriptionStatus } from "./dbTables/guildBilling"
import { userDoc } from "./lib/validators"
import {
  billingCustomerDoc,
  billingPriceDoc,
  checkoutDoc,
  communityGuildDoc,
} from "./lib/communityValidators"
import { internal } from "./_generated/api"
export const billingUser = internalQuery({
  args: {},
  returns: v.object({
    user: userDoc,
    customer: v.union(billingCustomerDoc, v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique()
    return { user, customer }
  },
})

export const view = query({
  args: { discordGuildId: v.optional(v.string()) },
  returns: v.object({
    configured: v.boolean(),
    canManageOwnBilling: v.boolean(),
    communityPublishIdentity: v.union(v.boolean(), v.null()),
    subscriptions: v.array(
      v.object({
        id: v.id("paidCommunityActivations"),
        announce: v.boolean(),
        displayRole: v.boolean(),
        active: v.boolean(),
        testMode: v.boolean(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique()
    const paid = await ctx.db
      .query("paidCommunityActivations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(100)
    let communityPublishIdentity: boolean | null = null
    if (args.discordGuildId) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discord_guild_id", (q) =>
          q.eq("discordGuildId", args.discordGuildId!)
        )
        .unique()
      if (guild) {
        await requireDiscordGuildManager(ctx, guild._id)
        communityPublishIdentity =
          (
            await ctx.db
              .query("communityPreferences")
              .withIndex("by_guild", (q) => q.eq("guildId", guild._id))
              .unique()
          )?.publishIdentity ?? false
      }
    }
    return {
      communityPublishIdentity,
      configured:
        backendEnv.STRIPE_TEST_CHECKOUT_ENABLED === "true" &&
        !!backendEnv.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
        !!backendEnv.STRIPE_GUILD_PREMIUM_PRICE_ID &&
        !!backendEnv.CLEO_DASHBOARD_ORIGIN,
      canManageOwnBilling: !!customer,
      subscriptions: paid.map((p) => ({
        id: p._id,
        announce: p.announce,
        displayRole: p.displayRole,
        active: !p.revoked && p.paidUntil > Date.now(),
        testMode: p.testMode,
      })),
    }
  },
})
export const context = internalQuery({
  args: { userId: v.id("users"), discordGuildId: v.string() },
  returns: v.object({
    guild: v.union(communityGuildDoc, v.null()),
    customer: v.union(billingCustomerDoc, v.null()),
    price: v.union(billingPriceDoc, v.null()),
  }),
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique()
    const price = backendEnv.STRIPE_GUILD_PREMIUM_PRICE_ID
      ? await ctx.db
          .query("guildBillingPrices")
          .withIndex("by_stripe_price_id", (q) =>
            q.eq("stripePriceId", backendEnv.STRIPE_GUILD_PREMIUM_PRICE_ID!)
          )
          .unique()
      : null
    return { guild, customer, price }
  },
})
export const reserve = internalMutation({
  args: {
    userId: v.id("users"),
    discordUserId: v.string(),
    discordGuildId: v.string(),
    purchaserKind: v.union(v.literal("owner"), v.literal("administrator")),
    announce: v.boolean(),
    displayRole: v.boolean(),
    key: v.string(),
  },
  returns: checkoutDoc,
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    if (
      !guild ||
      guild.botLeftAt !== undefined ||
      !backendEnv.CLEO_OFFICIAL_GUILD_ID ||
      guild.discordGuildId === backendEnv.CLEO_OFFICIAL_GUILD_ID
    )
      throw new ConvexError("Select an independent Cleo-installed community.")
    const linked = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", "discord")
      )
      .take(2)
    if (
      linked.length !== 1 ||
      linked[0]?.providerAccountId !== args.discordUserId
    )
      throw new ConvexError("Discord identity changed.")
    if ((await getGuildAccess(ctx, guild)).capabilities.length)
      throw new ConvexError("This community already has Premium coverage.")
    const existing = await ctx.db
      .query("premiumCheckouts")
      .withIndex("by_guild", (q) => q.eq("guildId", guild._id))
      .order("desc")
      .first()
    if (existing && existing.closedAt === undefined) {
      if (
        existing.sessionId === undefined &&
        existing.creationStartedAt === undefined &&
        existing.userId === args.userId
      ) {
        await ctx.db.patch(existing._id, { closedAt: Date.now() })
      } else {
        if (existing.expiresAt <= Date.now())
          throw new ConvexError(
            "The previous checkout is awaiting Stripe reconciliation. Try again shortly."
          )
        if (
          existing.userId !== args.userId ||
          existing.announce !== args.announce ||
          existing.displayRole !== args.displayRole
        )
          throw new ConvexError(
            "A checkout is already in progress for this community."
          )
        return existing
      }
    }
    const value = {
      guildId: guild._id,
      userId: args.userId,
      discordUserId: args.discordUserId,
      purchaserKind: args.purchaserKind,
      announce: args.announce,
      displayRole: args.displayRole,
      key: args.key,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    }
    const id = await ctx.db.insert("premiumCheckouts", value)
    await ctx.scheduler.runAfter(
      300000,
      internal.premiumActions.recoverCheckout,
      { key: args.key, attempt: 0 }
    )
    return {
      ...value,
      _id: id,
      _creationTime: Date.now(),
      url: undefined,
      sessionId: undefined,
    }
  },
})
/** Fence superseded reservations before their first Stripe request. */
export const beginCheckout = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("premiumCheckouts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique()
    if (!row || row.closedAt !== undefined || row.sessionId !== undefined)
      throw new Error("Checkout changed. Retry your purchase.")
    if (row.expiresAt < Date.now() + 1805000)
      throw new Error(
        "Checkout is awaiting reconciliation. Retry after verification."
      )
    if (row.creationStartedAt === undefined)
      await ctx.db.patch(row._id, { creationStartedAt: Date.now() })
    return null
  },
})
export const checkoutCreated = internalMutation({
  args: {
    key: v.string(),
    sessionId: v.string(),
    url: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("premiumCheckouts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique()
    if (
      !row ||
      row.closedAt !== undefined ||
      (row.sessionId !== undefined && row.sessionId !== args.sessionId)
    )
      throw new Error("Checkout reservation expired or changed.")
    await ctx.db.patch(row._id, {
      sessionId: args.sessionId,
      url: args.url,
      expiresAt: args.expiresAt,
    })
    return null
  },
})
export const checkoutByKey = internalQuery({
  args: { key: v.string() },
  returns: v.union(checkoutDoc, v.null()),
  handler: (ctx, args) =>
    ctx.db
      .query("premiumCheckouts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique(),
})
export const closeCheckout = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("premiumCheckouts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique()
    if (row) await ctx.db.patch(row._id, { closedAt: Date.now() })
    return null
  },
})
export const reconciliationPage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    ids: v.array(v.string()),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("guildSubscriptions")
      .withIndex("by_reconcile_due", (q) =>
        q.gt("nextReconcileAt", null).lte("nextReconcileAt", Date.now())
      )
      .take(20)
    for (const row of rows)
      await ctx.db.patch(row._id, { nextReconcileAt: Date.now() + 300000 })
    return {
      ids: rows.map((row) => row.stripeSubscriptionId),
      cursor: rows.length === 20 ? "due" : null,
    }
  },
})
export const backfillReconciliation = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("guildSubscriptions")
      .paginate({ cursor: args.cursor ?? null, numItems: 100 })
    for (const row of page.page)
      if (row.nextReconcileAt === undefined)
        await ctx.db.patch(row._id, {
          nextReconcileAt: [
            "canceled",
            "revoked",
            "incomplete_expired",
          ].includes(row.status)
            ? null
            : Date.now(),
        })
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.premiumPurchases.backfillReconciliation,
        { cursor: page.continueCursor }
      )
    return null
  },
})
export const managedPaymentCustomer = internalQuery({
  args: { customerId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripe_customer_id", (q) =>
        q.eq("stripeCustomerId", args.customerId)
      )
      .unique()
    if (!customer) return false
    return (
      !!(await ctx.db
        .query("guildSubscriptions")
        .withIndex("by_customer_id", (q) => q.eq("customerId", customer._id))
        .first()) ||
      !!(await ctx.db
        .query("premiumCheckouts")
        .withIndex("by_user_open", (q) =>
          q.eq("userId", customer.userId).eq("closedAt", undefined)
        )
        .first())
    )
  },
})
export const preferences = mutation({
  args: {
    activationId: v.id("paidCommunityActivations"),
    announce: v.boolean(),
    displayRole: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const activation = await ctx.db.get(args.activationId)
    if (!activation || activation.userId !== user._id)
      throw new ConvexError("This purchase is not yours.")
    await ctx.db.patch(activation._id, {
      announce: args.announce,
      displayRole: args.displayRole,
      updatedAt: Date.now(),
    })
    await queueRoleSync(ctx, activation.discordUserId)
    return null
  },
})
export const communityConsent = internalMutation({
  args: { discordGuildId: v.string(), publishIdentity: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    if (!guild) throw new Error("Community unavailable.")
    const current = await ctx.db
      .query("communityPreferences")
      .withIndex("by_guild", (q) => q.eq("guildId", guild._id))
      .unique()
    const value = {
      guildId: guild._id,
      publishIdentity: args.publishIdentity,
      revision: (current?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    }
    if (current) await ctx.db.patch(current._id, value)
    else await ctx.db.insert("communityPreferences", value)
    return null
  },
})
export const acquire = internalMutation({
  args: { subscriptionId: v.string(), worker: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("stripeReconciliationLocks")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .unique()
    if (row && row.leaseUntil > Date.now()) return false
    if (row)
      await ctx.db.patch(row._id, {
        worker: args.worker,
        leaseUntil: Date.now() + 60000,
      })
    else
      await ctx.db.insert("stripeReconciliationLocks", {
        ...args,
        leaseUntil: Date.now() + 60000,
      })
    return true
  },
})
export const release = internalMutation({
  args: { subscriptionId: v.string(), worker: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("stripeReconciliationLocks")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .unique()
    if (row?.worker === args.worker)
      await ctx.db.patch(row._id, { leaseUntil: 0 })
    return null
  },
})
export const paymentSubscription = internalQuery({
  args: {
    paymentIntentId: v.optional(v.string()),
    chargeId: v.optional(v.string()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const payment = args.chargeId
      ? await ctx.db
          .query("communityPayments")
          .withIndex("by_charge", (q) => q.eq("chargeId", args.chargeId))
          .first()
      : args.paymentIntentId
        ? await ctx.db
            .query("communityPayments")
            .withIndex("by_payment_intent", (q) =>
              q.eq("paymentIntentId", args.paymentIntentId)
            )
            .first()
        : null
    return payment?.subscriptionId ?? null
  },
})
export const apply = internalMutation({
  args: {
    eventId: v.string(),
    worker: v.string(),
    subscriptionId: v.string(),
    customerId: v.string(),
    checkoutKey: v.string(),
    productId: v.string(),
    priceId: v.string(),
    status: subscriptionStatus,
    startsAt: v.number(),
    endsAt: v.number(),
    trialEndsAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    revoked: v.boolean(),
    testMode: v.boolean(),
    paidInvoice: v.optional(
      v.object({
        id: v.string(),
        paidUntil: v.number(),
        payments: v.array(
          v.object({ paymentIntentId: v.string(), chargeId: v.string() })
        ),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lock = await ctx.db
      .query("stripeReconciliationLocks")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .unique()
    if (
      args.paidInvoice &&
      (!args.paidInvoice.payments.length ||
        args.paidInvoice.payments.length > 10)
    )
      throw new Error("Invalid invoice payment evidence.")
    if (!lock || lock.worker !== args.worker || lock.leaseUntil <= Date.now())
      throw new Error("Billing reconciliation lease expired.")
    const receipt = await ctx.db
      .query("integrationReceipts")
      .withIndex("by_provider_key", (q) =>
        q.eq("provider", "stripe").eq("key", args.eventId)
      )
      .unique()
    if (receipt) {
      await ctx.db.patch(lock._id, { leaseUntil: 0 })
      return null
    }
    const reservation = await ctx.db
      .query("premiumCheckouts")
      .withIndex("by_key", (q) => q.eq("key", args.checkoutKey))
      .unique()
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripe_customer_id", (q) =>
        q.eq("stripeCustomerId", args.customerId)
      )
      .unique()
    const price = await ctx.db
      .query("guildBillingPrices")
      .withIndex("by_stripe_price_id", (q) =>
        q.eq("stripePriceId", args.priceId)
      )
      .unique()
    if (
      !reservation ||
      !customer ||
      customer.userId !== reservation.userId ||
      !price?.enabled ||
      price.stripeProductId !== args.productId ||
      !Number.isSafeInteger(args.startsAt) ||
      !Number.isSafeInteger(args.endsAt) ||
      args.endsAt <= args.startsAt ||
      args.startsAt > Date.now() ||
      (args.paidInvoice &&
        (!Number.isSafeInteger(args.paidInvoice.paidUntil) ||
          args.paidInvoice.paidUntil > args.endsAt))
    )
      throw new Error("Untrusted Stripe subscription association.")
    const existing = await ctx.db
      .query("guildSubscriptions")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.subscriptionId)
      )
      .unique()
    if (
      existing &&
      (existing.guildId !== reservation.guildId ||
        existing.customerId !== customer._id)
    )
      throw new Error("Subscription identity cannot change.")
    const now = Date.now()
    const guild = await ctx.db.get(reservation.guildId)
    if (!guild) throw new Error("Community unavailable.")
    const priorCoverage =
      (
        await getGuildAccess(ctx, guild, now, {
          includeRevoked: false,
          excludeSubscriptionId: args.subscriptionId,
        })
      ).capabilities.length > 0 ||
      !!(await ctx.db
        .query("paidCommunityActivations")
        .withIndex("by_guild_active_end", (q) =>
          q.eq("guildId", guild._id).eq("revoked", false).gt("paidUntil", now)
        )
        .first())
    const revoked = args.revoked || existing?.revokedAt !== undefined
    const status = revoked ? ("revoked" as const) : args.status
    const value = {
      customerId: customer._id,
      guildId: guild._id,
      discordGuildId: guild.discordGuildId,
      stripeSubscriptionId: args.subscriptionId,
      stripeProductId: args.productId,
      stripePriceId: args.priceId,
      status,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      trialEndsAt: args.trialEndsAt,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      revokedAt: revoked ? (existing?.revokedAt ?? now) : undefined,
      canceledAt: status === "canceled" ? now : undefined,
      paymentFailedAt:
        status === "past_due" ? (existing?.paymentFailedAt ?? now) : undefined,
      graceEndsAt:
        status === "past_due"
          ? Math.min(existing?.graceEndsAt ?? now + 86400000, now + 86400000)
          : undefined,
      lastEventId: args.eventId,
      eventCreatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      reconciledAt: now,
      nextReconcileAt: nextSubscriptionReconciliation(
        status,
        Math.max(
          args.endsAt,
          status === "past_due" ? (existing?.graceEndsAt ?? now + 86400000) : 0
        ),
        now
      ),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    if (existing) await ctx.db.replace(existing._id, value)
    else await ctx.db.insert("guildSubscriptions", value)
    if (["canceled", "incomplete_expired", "revoked"].includes(status))
      await ctx.db.patch(reservation._id, { closedAt: now })
    const paid = await ctx.db
      .query("paidCommunityActivations")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .unique()
    if (args.paidInvoice && !revoked && status === "active") {
      const paidValue = {
        subscriptionId: args.subscriptionId,
        guildId: guild._id,
        userId: reservation.userId,
        discordUserId: reservation.discordUserId,
        purchaserKind: reservation.purchaserKind,
        announce: paid?.announce ?? reservation.announce,
        displayRole: paid?.displayRole ?? reservation.displayRole,
        paidUntil: Math.max(paid?.paidUntil ?? 0, args.paidInvoice.paidUntil),
        revoked: false,
        firstPaidInvoiceId: paid?.firstPaidInvoiceId ?? args.paidInvoice.id,
        testMode: args.testMode,
        updatedAt: now,
      }
      if (paid) await ctx.db.patch(paid._id, paidValue)
      else {
        const paidId = await ctx.db.insert(
          "paidCommunityActivations",
          paidValue
        )
        if (!priorCoverage)
          await ctx.db.insert("communityAnnouncementOutbox", {
            activationId: paidId,
            key: `premium:${args.subscriptionId}:${args.paidInvoice.id}`,
            state: "pending",
            updatedAt: now,
          })
      }
      const recorded = await ctx.db
        .query("communityPayments")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", args.paidInvoice!.id))
        .take(11)
      for (const payment of args.paidInvoice.payments)
        if (
          !recorded.some(
            (row) => row.paymentIntentId === payment.paymentIntentId
          )
        )
          await ctx.db.insert("communityPayments", {
            invoiceId: args.paidInvoice.id,
            subscriptionId: args.subscriptionId,
            ...payment,
          })
    } else if (paid && (revoked || status !== "active"))
      await ctx.db.patch(paid._id, {
        revoked: true,
        paidUntil: Math.min(paid.paidUntil, now),
        updatedAt: now,
      })
    await queueRoleSync(ctx, reservation.discordUserId)
    await ctx.db.insert("integrationReceipts", {
      provider: "stripe",
      key: args.eventId,
      createdAt: now,
    })
    await ctx.db.patch(lock._id, { leaseUntil: 0 })
    return null
  },
})
