import { backendEnv } from "@workspace/env/backend"
import { billingOrigin, BillingOriginConfigurationError } from "./billingOrigin"

/** Presence is configuration evidence only, never Stripe account or payment evidence. */
export function billingConfiguration() {
  let returnOrigin: string | null = null
  let invalidOriginSetting:
    BillingOriginConfigurationError["setting"] | undefined
  try {
    returnOrigin = billingOrigin()
  } catch (error) {
    if (!(error instanceof BillingOriginConfigurationError)) throw error
    invalidOriginSetting = error.setting
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
    ...(invalidOriginSetting ? [invalidOriginSetting] : []),
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
