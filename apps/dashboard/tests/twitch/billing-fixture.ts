import type { BillingProfile } from "../../src/features/billing/PaymentForms"

const params = new URLSearchParams(location.search)
let hasCustomer = !params.has("emptyBilling")
const customer = {
  name: "Cleo Tester",
  email: "billing@example.com",
  address: {
    line1: "1 Test Street",
    line2: "",
    city: "London",
    state: "",
    postalCode: "SW1A 1AA",
    country: "GB",
  },
  defaultMethodId: "pm_fixture" as string | null,
}
let methods: BillingProfile["methods"] = params.has("emptyBilling")
  ? []
  : [
      {
        id: "pm_fixture",
        type: "card",
        label: "visa card",
        last4: "4242",
        brand: "visa",
        expiryMonth: 12,
        expiryYear: 2030,
        manageable: true,
      },
      {
        id: "pm_other",
        type: "card",
        label: "mastercard card",
        last4: "4444",
        brand: "mastercard",
        expiryMonth: 6,
        expiryYear: 2031,
        manageable: true,
      },
    ]
export function billingFixture(path: string, args: unknown): unknown {
  if (path === "billingPortalActions:profile") {
    if (params.has("failBillingProfile"))
      throw new Error("Provider unavailable")
    return {
      clerkUserId: "fixture-clerk",
      customer: hasCustomer ? { ...customer } : null,
      methods: methods.map((method) => ({ ...method })),
      hasMoreMethods: false,
      invoices: params.has("emptyBilling")
        ? []
        : [
            {
              id: "in_fixture",
              number: "CLEO-001",
              createdAt: Date.now() - 86400000,
              amount: 499,
              currency: "gbp",
              status: "paid",
              url: "https://invoice.stripe.com/i/fixture",
              pdf: "https://pay.stripe.com/invoice/fixture/pdf",
            },
          ],
      hasMoreInvoices: false,
      subscriptions: params.has("emptyBilling")
        ? []
        : [
            {
              id: "sub_fixture",
              status: "active",
              cancelAtPeriodEnd: false,
              periodEnd: Date.now() + 86400000,
              items: [
                {
                  name: "Cleo Server Premium",
                  amount: 499,
                  currency: "gbp",
                  quantity: 1,
                  interval: "month",
                  intervalCount: 1,
                },
              ],
            },
          ],
      hasMoreSubscriptions: false,
    } satisfies BillingProfile
  }
  if (path === "billingPortalActions:beginSetup") {
    hasCustomer = true
    return {
      id: "seti_fixture",
      clientSecret: "seti_fixture_secret_fixture",
      returnUrl: `${location.origin}/billing`,
    }
  }
  if (path === "billingPortalActions:completeSetup") {
    hasCustomer = true
    if (params.has("setupProcessing")) return "processing"
    methods = [
      {
        id: "pm_new",
        type: "card",
        label: "visa card",
        last4: "1111",
        brand: "visa",
        expiryMonth: 12,
        expiryYear: 2032,
        manageable: true,
      },
      ...methods.filter((method) => method.id !== "pm_new"),
    ]
    customer.defaultMethodId = "pm_new"
    return "saved"
  }
  if (path === "billingPortalActions:cancelSetup") return null
  if (path === "billingPortalActions:updateDetails") {
    if (
      !args ||
      typeof args !== "object" ||
      !("name" in args) ||
      !("email" in args) ||
      typeof args.name !== "string" ||
      typeof args.email !== "string"
    )
      throw new Error("Invalid billing details")
    customer.name = args.name
    customer.email = args.email
    return null
  }
  if (
    path === "billingPortalActions:makeDefault" ||
    path === "billingPortalActions:removeMethod"
  ) {
    if (
      !args ||
      typeof args !== "object" ||
      !("paymentMethodId" in args) ||
      typeof args.paymentMethodId !== "string"
    )
      throw new Error("Invalid fixture method")
    if (params.has("failMethodChange"))
      throw new Error("Provider rejected update")
    const id = args.paymentMethodId
    if (path.endsWith(":makeDefault")) customer.defaultMethodId = id
    else methods = methods.filter((method) => method.id !== id)
    return null
  }
  return undefined
}
