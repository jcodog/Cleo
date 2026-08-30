import type { Metadata } from "next"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { preloadQuery } from "convex/nextjs"

import { DashboardShellClient } from "@/features/app-shell"
import { OnboardingGuard } from "@/features/onboarding/OnboardingGuard"
import { getConvexAuthToken } from "@/lib/convex-auth"

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
  const [preloadedOnboarding, preloadedStaffAccess, preloadedManageableGuilds] =
    await Promise.all([
      preloadQuery(api.queries.dashboard.account.onboarding.get, {}, { token }),
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
