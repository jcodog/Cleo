import type { Metadata } from "next"
import { fetchQuery } from "convex/nextjs"
import { redirect } from "next/navigation"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { getConvexAuthToken } from "@/lib/convex-auth"
import {
  applicationEntryPath,
  getProductReturnPath,
} from "@/features/auth/applicationEntry"

import { OnboardingExperience } from "@/features/onboarding/OnboardingExperience"

export const metadata: Metadata = {
  title: "Welcome",
  description: "Connect your Cleo account and choose where to begin.",
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const params = await searchParams
  const returnTo = getProductReturnPath(
    typeof params.returnTo === "string" ? params.returnTo : null
  )
  const token = await getConvexAuthToken()
  const onboarding = await fetchQuery(
    api.queries.dashboard.account.onboarding.get,
    {},
    { token }
  )
  if (applicationEntryPath(onboarding) === "/dashboard")
    redirect(returnTo ?? "/dashboard")
  return <OnboardingExperience returnTo={returnTo} />
}
