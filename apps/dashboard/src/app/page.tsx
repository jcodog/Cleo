import { auth } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { redirect } from "next/navigation"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { getConvexAuthToken } from "@/lib/convex-auth"
import { applicationEntryPath } from "@/features/auth/applicationEntry"
import { dashboardEnv } from "@workspace/env/dashboard"
import { resolveWebOrigin } from "@workspace/env/origins"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ s?: string | string[] }>
}) {
  const { userId } = await auth()
  if (!userId) {
    if ((await searchParams).s === "sign-out") {
      redirect(
        resolveWebOrigin({
          configuredUrl: dashboardEnv.NEXT_PUBLIC_SITE_URL,
          vercelUrl: dashboardEnv.VERCEL_URL,
          vercelEnv: dashboardEnv.VERCEL_ENV,
          allowVercelUrl: false,
          variableName: "NEXT_PUBLIC_SITE_URL",
          localOrigin: "http://localhost:3001",
        })
      )
    }
    redirect("/sign-in")
  }
  const token = await getConvexAuthToken()
  const onboarding = await fetchQuery(
    api.queries.dashboard.account.onboarding.get,
    {},
    { token }
  )
  redirect(applicationEntryPath(onboarding))
}
