import { ConvexError } from "convex/values"
import { backendEnv } from "@workspace/env/backend"

function origin(value: string) {
  const url = new URL(value)
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
export function billingOrigin(requested?: string) {
  if (!backendEnv.CLEO_DASHBOARD_ORIGIN)
    throw new ConvexError("Billing return address is not configured.")
  const canonical = origin(backendEnv.CLEO_DASHBOARD_ORIGIN)
  const approved = [
    canonical,
    ...(backendEnv.CLEO_DASHBOARD_ALLOWED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(origin) ?? []),
  ]
  const selected = requested ? origin(requested) : canonical
  if (!approved.includes(selected))
    throw new ConvexError(
      "Billing updates are not configured for this dashboard address. Please contact support."
    )
  return selected
}
