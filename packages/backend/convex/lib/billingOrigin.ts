import { ConvexError } from "convex/values"
import { backendEnv } from "@workspace/env/backend"

export function exactBillingOrigin(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConvexError("Billing return address is invalid.")
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new ConvexError("Billing return address is invalid.")
  return url.origin
}
/** Exact configured origins only. Never accept arbitrary preview-domain suffixes. */
export function configuredBillingOrigins() {
  if (!backendEnv.CLEO_DASHBOARD_ORIGIN)
    throw new ConvexError("Billing return address is not configured.")
  const canonical = exactBillingOrigin(backendEnv.CLEO_DASHBOARD_ORIGIN)
  return [
    canonical,
    ...(backendEnv.CLEO_DASHBOARD_ALLOWED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(exactBillingOrigin) ?? []),
  ]
}

export function billingOrigin(requested?: string) {
  const approved = configuredBillingOrigins()
  const selected = requested ? exactBillingOrigin(requested) : approved[0]!
  if (!approved.includes(selected))
    throw new ConvexError(
      "Billing updates are not configured for this dashboard address. Please contact support."
    )
  return selected
}
