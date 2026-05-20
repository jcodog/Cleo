// apps/dashboard/src/features/app-shell/components/app-sidebar-nav.tsx
import Link from "next/link"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import type { AppShellNavSection } from "@/features/app-shell/types"

type AppSidebarNavProps = {
  navSections: AppShellNavSection[]
}

export function AppSidebarNav({ navSections }: AppSidebarNavProps) {
  return (
    <>
      {navSections.map((section, sectionIndex) => (
        <SidebarGroup
          key={sectionIndex}
          className="p-3 group-data-[collapsible=icon]:p-2"
        >
          {section.title ? (
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
          ) : null}

          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {section.items.map((item, itemIndex) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={itemIndex}>
                    <SidebarMenuButton
                      render={
                        item.disabled ? undefined : <Link href={item.href} />
                      }
                      className={
                        item.disabled
                          ? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-sidebar-foreground"
                          : undefined
                      }
                      isActive={item.isActive}
                      tooltip={item.disabled ? undefined : item.title}
                      disabled={item.disabled}
                    >
                      {Icon ? <Icon /> : null}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
