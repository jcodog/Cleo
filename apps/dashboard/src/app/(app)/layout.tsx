import type { Metadata } from "next"

import { DashboardShellClient } from "@/features/app-shell"
import { OnboardingGuard } from "@/features/onboarding/OnboardingGuard"

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | Cleo Dashboard",
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
}

const AppLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <OnboardingGuard>
      <DashboardShellClient>{children}</DashboardShellClient>
    </OnboardingGuard>
  )
}

export default AppLayout
