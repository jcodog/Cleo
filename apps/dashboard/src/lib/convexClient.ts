import { dashboardEnv } from "@workspace/env/dashboard"
import { ConvexReactClient } from "convex/react"

const convexUrl = dashboardEnv.NEXT_PUBLIC_CONVEX_URL

// The provider's session-aware guard protects pending work until Clerk signs out.
export const convexClient = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null
