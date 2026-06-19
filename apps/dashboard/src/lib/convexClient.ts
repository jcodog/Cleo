import { dashboardEnv } from "@workspace/env/dashboard"
import { ConvexReactClient } from "convex/react"

const convexUrl = dashboardEnv.NEXT_PUBLIC_CONVEX_URL

export const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null
