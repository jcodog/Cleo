import type { ComponentType, ReactNode } from "react"
import type { StaffTopbarEntry } from "@/features/app-shell/staffAccess"

export type AppShellNavItem = {
  title: string
  href: string
  icon?: ComponentType<{ className?: string }>
  badge?: string
  disabled?: boolean
  isActive?: boolean
}

export type AppShellNavSection = {
  title?: string
  items: AppShellNavItem[]
}

export type AppShellProps = {
  navSections: AppShellNavSection[]
  footerNavSections: AppShellNavSection[]
  children: ReactNode
  sidebarHeader?: ReactNode
  sidebarFooter?: ReactNode
  topbarLeft?: ReactNode
  topbarRight?: ReactNode
  showDiscordGuildSelect?: boolean
  showPlatformSelector?: boolean
  staffEntry?: StaffTopbarEntry | null
}
