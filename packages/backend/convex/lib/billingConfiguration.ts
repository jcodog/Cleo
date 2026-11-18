import { backendEnv } from "@workspace/env/backend"
import { billingOrigin } from "./billingOrigin"

/** Presence is configuration evidence only, never Stripe account or payment evidence. */
export function billingConfiguration() {
  let returnOrigin: string | null = null
  try {
    returnOrigin = billingOrigin()
  } catch {
    /* Unusable configuration disables management. */
  }
  const key = backendEnv.STRIPE_SECRET_KEY
  const stripeMode = !key
    ? "missing"
    : key.startsWith("sk_test_")
      ? "test"
      : "unsupported"
  const missing = [
    ...(!key ? ["STRIPE_SECRET_KEY"] : []),
    ...(!backendEnv.STRIPE_EXPECTED_ACCOUNT_ID
      ? ["STRIPE_EXPECTED_ACCOUNT_ID"]
      : []),
    ...(!backendEnv.STRIPE_GUILD_PREMIUM_PRICE_ID
      ? ["STRIPE_GUILD_PREMIUM_PRICE_ID"]
      : []),
    ...(!backendEnv.STRIPE_WEBHOOK_SECRET ? ["STRIPE_WEBHOOK_SECRET"] : []),
    ...(!returnOrigin ? ["CLEO_DASHBOARD_ORIGIN"] : []),
  ]
  return {
    stripeMode,
    missing,
    checkoutEnabled: backendEnv.STRIPE_TEST_CHECKOUT_ENABLED === "true",
    catalogueWritesEnabled:
      backendEnv.STRIPE_CATALOGUE_WRITES_ENABLED === "true",
    returnOrigin,
  }
}
