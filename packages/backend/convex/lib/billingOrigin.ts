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
export class BillingOriginConfigurationError extends ConvexError<string> {
  constructor(
    readonly setting: "CLEO_DASHBOARD_ORIGIN" | "CLEO_DASHBOARD_ALLOWED_ORIGINS"
  ) {
    super(`Billing return address configuration is invalid. Check ${setting}.`)
  }
}

/** Exact configured origins only. Never accept arbitrary preview-domain suffixes. */
export function configuredBillingOrigins() {
  let setting: BillingOriginConfigurationError["setting"] =
    "CLEO_DASHBOARD_ORIGIN"
  try {
    const canonical = exactBillingOrigin(backendEnv[setting] ?? "")
    setting = "CLEO_DASHBOARD_ALLOWED_ORIGINS"
    return [
      canonical,
      ...(backendEnv[setting]
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(exactBillingOrigin) ?? []),
    ]
  } catch (error) {
    if (!(error instanceof ConvexError)) throw error
    throw new BillingOriginConfigurationError(setting)
  }
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
