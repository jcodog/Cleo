"use node"
import { z } from "zod"
import { ConvexError } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
export class StripeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly type?: string
  ) {
    super(`Stripe integration unavailable (${status}).`)
  }
}
export function stripeCommunityConfig(checkout = false) {
  const key = backendEnv.STRIPE_SECRET_KEY
  if (
    !key ||
    !key.startsWith("sk_test_") ||
    (checkout && backendEnv.STRIPE_TEST_CHECKOUT_ENABLED !== "true")
  )
    throw new ConvexError(
      !key
        ? "STRIPE_SECRET_KEY is missing on this Convex deployment."
        : !key.startsWith("sk_test_")
          ? "STRIPE_SECRET_KEY must use test mode. Live charging is disabled."
          : "New test checkout is disabled by STRIPE_TEST_CHECKOUT_ENABLED."
    )
  return key
}
export async function verifyStripeAccount() {
  const expected = backendEnv.STRIPE_EXPECTED_ACCOUNT_ID
  if (!expected)
    throw new ConvexError(
      "STRIPE_EXPECTED_ACCOUNT_ID is missing on this Convex deployment."
    )
  const account = z
    .object({ id: z.string() })
    .parse(await stripeRequest("/account"))
  if (account.id !== expected)
    throw new ConvexError(
      "Stripe account does not match the configured Cleo account. Check STRIPE_EXPECTED_ACCOUNT_ID and STRIPE_SECRET_KEY."
    )
}
export async function stripeRequest(
  path: string,
  fields?: Record<string, string>,
  idempotencyKey?: string
): Promise<unknown> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: fields ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${stripeCommunityConfig()}`,
      "Stripe-Version": "2026-09-30.endive",
      ...(fields
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(fields ? { body: new URLSearchParams(fields) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) {
    const error = z
      .object({ error: z.object({ type: z.string() }) })
      .safeParse(await response.json().catch(() => null))
    throw new StripeRequestError(response.status, error.data?.error.type)
  }
  const text = await response.text()
  if (text.length > 1048576) throw new Error("Stripe response exceeds limit.")
  return JSON.parse(text)
}
const id = z.string().min(1).max(255)
export const stripeSubscription = z.object({
  id,
  customer: id,
  status: z.enum([
    "active",
    "trialing",
    "past_due",
    "canceled",
    "unpaid",
    "incomplete",
    "incomplete_expired",
    "paused",
  ]),
  metadata: z.object({ cleo_checkout: id }),
  latest_invoice: id.nullable().optional(),
  cancel_at_period_end: z.boolean(),
  trial_end: z.number().nullable().optional(),
  items: z.object({
    data: z
      .array(
        z.object({
          current_period_start: z.number().int(),
          current_period_end: z.number().int(),
          price: z.object({ id, product: id }),
        })
      )
      .length(1),
  }),
})
export const stripeInvoice = z.object({
  id,
  amount_paid: z.number().int(),
  status: z.string().nullable(),
  parent: z
    .object({
      subscription_details: z
        .object({ subscription: id })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  subscription: id.optional(),
  period_end: z.number().int(),
  lines: z.object({
    data: z
      .array(
        z.object({
          period: z.object({ end: z.number().int(), start: z.number().int() }),
          parent: z
            .object({
              subscription_item_details: z
                .object({ subscription: id })
                .nullable()
                .optional(),
            })
            .nullable()
            .optional(),
        })
      )
      .max(100),
    has_more: z.boolean(),
  }),
  payment_intent: id.nullable().optional(),
  payments: z
    .object({
      has_more: z.boolean(),
      data: z
        .array(
          z.object({
            status: z.string(),
            amount_paid: z.number().int().nullable(),
            payment: z.object({
              type: z.string(),
              payment_intent: id.optional(),
            }),
          })
        )
        .max(10),
    })
    .optional(),
})

/** Invoice coverage, never the current subscription period, is proof of paid support. */
export function invoicePaidUntil(
  invoice: z.infer<typeof stripeInvoice>,
  subscriptionId: string,
  periodEnd: number
): number | undefined {
  if (
    invoice.status !== "paid" ||
    invoice.amount_paid <= 0 ||
    invoice.lines.has_more ||
    (invoice.parent?.subscription_details?.subscription ??
      invoice.subscription) !== subscriptionId
  )
    return undefined
  const periods = invoice.lines.data.filter(
    (line) =>
      line.parent?.subscription_item_details?.subscription === subscriptionId &&
      line.period.end > line.period.start
  )
  if (!periods.length) return undefined
  return Math.min(periodEnd, ...periods.map((line) => line.period.end)) * 1000
}
