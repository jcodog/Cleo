import type { Metadata } from "next"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { preloadQuery, preloadedQueryResult } from "convex/nextjs"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { DashboardShellClient } from "@/features/app-shell"
import { OnboardingGuard } from "@/features/onboarding/OnboardingGuard"
import { getConvexAuthToken } from "@/lib/convex-auth"
import {
  applicationEntryPath,
  onboardingPath,
} from "@/features/auth/applicationEntry"

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | Cleo",
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
}

const AppLayout = async ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const token = await getConvexAuthToken()
  const preloadedOnboarding = await preloadQuery(
    api.queries.dashboard.account.onboarding.get,
    {},
    { token }
  )
  if (
    applicationEntryPath(preloadedQueryResult(preloadedOnboarding)) ===
    "/onboarding"
  ) {
    redirect(onboardingPath((await headers()).get("x-cleo-return-path")))
  }
  const [preloadedStaffAccess, preloadedManageableGuilds] = await Promise.all([
    preloadQuery(api.queries.dashboard.staff.access.get, {}, { token }),
    preloadQuery(
      api.queries.dashboard.discord.guilds.manageable.list,
      {},
      { token }
    ),
  ])

  return (
    <OnboardingGuard preloadedOnboarding={preloadedOnboarding}>
      <DashboardShellClient
        preloadedManageableGuilds={preloadedManageableGuilds}
        preloadedStaffAccess={preloadedStaffAccess}
      >
        {children}
      </DashboardShellClient>
    </OnboardingGuard>
  )
}

export default AppLayout
