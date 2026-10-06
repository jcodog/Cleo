import { dashboardEnv } from "@workspace/env/dashboard"
import { ConvexReactClient } from "convex/react"

const convexUrl = dashboardEnv.NEXT_PUBLIC_CONVEX_URL

// Background requests do not indicate unsaved form changes or block leaving.
export const convexClient = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null
