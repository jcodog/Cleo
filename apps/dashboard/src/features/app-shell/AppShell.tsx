import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { AppSidebar } from "@/features/app-shell/AppSidebar"
import { AppTopbar } from "@/features/app-shell/AppTopbar"
import type { AppShellProps } from "@/features/app-shell/types"

export function AppShell({
  children,
  navSections,
  footerNavSections,
  showDiscordGuildSelect,
  showPlatformSelector,
  staffEntry,
  hideSidebar = false,
}: AppShellProps) {
  if (hideSidebar)
    return (
      <main className="flex min-h-svh w-full flex-col">
        <AppTopbar staffEntry={staffEntry} showSidebar={false} />
        <section id="dashboard-page" className="flex flex-1 p-3 sm:p-6">
          {children}
        </section>
      </main>
    )
  return (
    <SidebarProvider>
      <AppSidebar
        navSections={navSections}
        footerNavSections={footerNavSections}
        showDiscordGuildSelect={showDiscordGuildSelect}
        showPlatformSelector={showPlatformSelector}
      />

      <SidebarInset className="min-h-0 overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col">
          <AppTopbar staffEntry={staffEntry} />
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
