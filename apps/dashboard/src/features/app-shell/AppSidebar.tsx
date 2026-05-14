import { OrganizationSwitcher } from "@clerk/nextjs"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@workspace/ui/components/sidebar"

import { AppSidebarNav } from "@/features/app-shell/AppSidebarNav"
import { AppPlatformSelector } from "@/features/app-shell/AppPlatformSelector"
import { DiscordGuildSelect } from "@/features/app-shell/DiscordGuildSelect"
import type { AppShellNavSection } from "@/features/app-shell/types"
import Image from "next/image"

type AppSidebarProps = {
  navSections: AppShellNavSection[]
  footerNavSections: AppShellNavSection[]
}

export function AppSidebar({
  navSections,
  footerNavSections,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" className="select-none">
      <SidebarHeader className="gap-3 p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-2 rounded-lg px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <div className="relative size-8 overflow-hidden rounded-full bg-primary/10">
            <Image
              src="/favicon-32x32.png"
              alt="CleoAI Logo"
              fill
              sizes="32px"
              className="object-cover"
              priority
            />
          </div>

          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">CleoAI</p>
          </div>
        </div>

        <div className="w-full px-1 group-data-[collapsible=icon]:hidden [&_.cl-organizationPreview]:min-w-0 [&_.cl-organizationPreview]:flex-1 [&_.cl-organizationPreviewMainIdentifier]:truncate [&_.cl-organizationPreviewTextContainer]:min-w-0 [&_.cl-organizationSwitcher]:w-full! [&_.cl-organizationSwitcherTrigger]:w-full! [&_.cl-organizationSwitcherTrigger]:max-w-none! [&_.cl-rootBox]:w-full!">
          <OrganizationSwitcher
            hidePersonal={true}
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full max-w-none",
                organizationSwitcher: "w-full max-w-none",
                organizationSwitcherTrigger:
                  "w-full max-w-none justify-between rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent",
                organizationPreview: "min-w-0 flex-1",
                organizationPreviewTextContainer: "min-w-0",
                organizationPreviewMainIdentifier:
                  "truncate text-sm font-medium",
                organizationSwitcherTriggerIcon: "shrink-0",
              },
            }}
          />
        </div>

        <AppPlatformSelector />
        <DiscordGuildSelect />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="pt-2">
        <AppSidebarNav navSections={navSections} />
      </SidebarContent>

      {footerNavSections.length > 0 ? (
        <SidebarFooter>
          <AppSidebarNav navSections={footerNavSections} />
        </SidebarFooter>
      ) : null}

      <SidebarRail />
    </Sidebar>
  )
}
