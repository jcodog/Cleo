import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { AppSidebar } from "@/features/app-shell/AppSidebar"
import { AppTopbar } from "@/features/app-shell/AppTopbar"
import { DashboardDiscordHydrator } from "@/features/app-shell/DashboardDiscordHydrator"
import type { AppShellProps } from "@/features/app-shell/types"

export function AppShell({
  children,
  navSections,
  footerNavSections,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <DashboardDiscordHydrator />
      <AppSidebar
        navSections={navSections}
        footerNavSections={footerNavSections}
      />

      <SidebarInset className="min-h-0 overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col">
          <AppTopbar />
          <section
            id="dashboard-page"
            className="flex min-h-0 flex-1 p-4 md:p-6"
          >
            {children}
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
