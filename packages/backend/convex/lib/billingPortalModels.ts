import { z } from "zod"
import { v } from "convex/values"

const nullableText = z.string().nullable().optional()
export const stripeAddress = z.object({
  line1: nullableText,
  line2: nullableText,
  city: nullableText,
  state: nullableText,
  postal_code: nullableText,
  country: nullableText,
})
export const billingAddress = v.object({
  line1: v.string(),
  line2: v.string(),
  city: v.string(),
  state: v.string(),
  postalCode: v.string(),
  country: v.string(),
})
export const billingMethod = v.object({
  id: v.string(),
  type: v.string(),
  label: v.string(),
  last4: v.union(v.string(), v.null()),
  brand: v.union(v.string(), v.null()),
  expiryMonth: v.union(v.number(), v.null()),
  expiryYear: v.union(v.number(), v.null()),
  manageable: v.boolean(),
})
export const stripeCustomer = z.object({
  id: z.string(),
  livemode: z.literal(false),
  deleted: z.literal(false).optional(),
  name: nullableText,
  email: nullableText,
  address: stripeAddress.nullable().optional(),
  invoice_settings: z.object({ default_payment_method: z.string().nullable() }),
  default_source: z
    .union([
      z.string(),
      z.object({
        id: z.string(),
        object: z.string(),
        brand: nullableText,
        last4: z
          .string()
          .regex(/^\d{4}$/)
          .optional(),
        exp_month: z.number().optional(),
        exp_year: z.number().optional(),
      }),
    ])
    .nullable()
    .optional(),
})
const bankLast4 = z.string().regex(/^\d{4}$/)
const bank = z.object({ last4: bankLast4, bank_name: nullableText })
export const stripeMethod = z.object({
  id: z.string(),
  customer: z.string().nullable(),
  livemode: z.literal(false),
  type: z.string(),
  card: z
    .object({
      brand: z.string().max(50),
      last4: z.string().regex(/^\d{4}$/),
      exp_month: z.number().int().min(1).max(12),
      exp_year: z.number().int().min(2000),
    })
    .optional(),
  us_bank_account: bank.optional(),
  sepa_debit: z.object({ last4: bankLast4 }).optional(),
  bacs_debit: z.object({ last4: bankLast4 }).optional(),
  au_becs_debit: z.object({ last4: bankLast4 }).optional(),
})
export function methodSummary(method: z.infer<typeof stripeMethod>) {
  const bankDetails =
    method.us_bank_account ??
    method.sepa_debit ??
    method.bacs_debit ??
    method.au_becs_debit
  return {
    id: method.id,
    type: method.type,
    label: method.card
      ? `${method.card.brand === "amex" ? "American Express" : method.card.brand.replaceAll("_", " ")} card`
      : method.type.replaceAll("_", " "),
    last4: method.card?.last4 ?? bankDetails?.last4 ?? null,
    brand: method.card?.brand ?? null,
    expiryMonth: method.card?.exp_month ?? null,
    expiryYear: method.card?.exp_year ?? null,
    manageable: true,
  }
}
export const billingInvoice = v.object({
  id: v.string(),
  number: v.union(v.string(), v.null()),
  createdAt: v.number(),
  amount: v.number(),
  currency: v.string(),
  status: v.string(),
  url: v.union(v.string(), v.null()),
  pdf: v.union(v.string(), v.null()),
})
export const billingSubscription = v.object({
  id: v.string(),
  status: v.string(),
  cancelAtPeriodEnd: v.boolean(),
  periodEnd: v.union(v.number(), v.null()),
  items: v.array(
    v.object({
      name: v.string(),
      amount: v.union(v.number(), v.null()),
      currency: v.string(),
      quantity: v.number(),
      interval: v.union(v.string(), v.null()),
      intervalCount: v.number(),
    })
  ),
})
export const stripeBillingSubscription = z.object({
  id: z.string(),
  customer: z.string(),
  livemode: z.literal(false),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  items: z.object({
    data: z
      .array(
        z.object({
          current_period_end: z.number().optional(),
          quantity: z.number().nullable(),
          price: z.object({
            unit_amount: z.number().nullable(),
            currency: z.string(),
            recurring: z
              .object({ interval: z.string(), interval_count: z.number() })
              .nullable(),
            product: z.union([
              z.string(),
              z.object({ name: z.string().optional() }),
            ]),
          }),
        })
      )
      .max(100),
    has_more: z.boolean().optional(),
  }),
})
export const stripeInvoiceSummary = z.object({
  id: z.string(),
  customer: z.string(),
  livemode: z.literal(false),
  number: z.string().nullable(),
  created: z.number(),
  total: z.number().int(),
  currency: z.string(),
  status: z.string().nullable(),
  hosted_invoice_url: z.string().nullable(),
  invoice_pdf: z.string().nullable(),
})
export function stripeBillingUrl(value: string | null) {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  return url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    [
      "invoice.stripe.com",
      "pay.stripe.com",
      "files.stripe.com",
      "billing.stripe.com",
    ].includes(url.hostname)
    ? url.href
    : null
}
export const operationKey = z.string().uuid()
export const methodId = z.string().regex(/^pm_[A-Za-z0-9]+$/)
export const setupId = z.string().regex(/^seti_[A-Za-z0-9]+$/)
export const setupIntent = z.object({
  id: z.string(),
  customer: z.string(),
  livemode: z.literal(false),
  client_secret: z.string().nullable(),
  status: z.string(),
  payment_method: z.string().nullable(),
  metadata: z.object({ cleo_user: z.string() }),
})
