"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { UserButton, useClerk } from "@clerk/nextjs"
import {
  IconCreditCard,
  IconHome,
  IconLogout,
  IconShieldLock,
} from "@tabler/icons-react"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { ThemeToggle } from "@/components/ThemeToggle"
import type { StaffTopbarEntry } from "@/features/app-shell/staffAccess"
import {
  getStaffUserButtonLink,
  type StaffUserButtonLink,
} from "@/features/app-shell/staffUserButton"

export function AppTopbar({
  staffEntry = null,
  showSidebar = true,
}: {
  staffEntry?: StaffTopbarEntry | null
  showSidebar?: boolean
}) {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur">
      {showSidebar ? (
        <>
          <SidebarTrigger />
          <Separator orientation="vertical" className="my-auto h-5" />
        </>
      ) : null}

      <div className="min-w-0 flex-1">
        {pathname.startsWith("/dashboard") ? (
          <nav aria-label="Breadcrumb" className="text-sm">
            <Link
              href="/dashboard/servers"
              aria-current={
                pathname === "/dashboard/servers" ? "page" : undefined
              }
              className="text-muted-foreground hover:text-foreground"
            >
              Servers
            </Link>
          </nav>
        ) : (
          <p className="truncate text-sm font-medium">
            {pathname.startsWith("/account")
              ? "Account settings"
              : pathname === "/billing" || pathname.startsWith("/billing/")
                ? "Billing"
                : "CleoAI Dashboard"}
          </p>
        )}
      </div>

      <MountedUserButton staffEntry={staffEntry} pathname={pathname} />
      <ThemeToggle />
    </header>
  )
}

function MountedUserButton({
  staffEntry,
  pathname,
}: {
  staffEntry: StaffTopbarEntry | null
  pathname: string
}) {
  const [mounted, setMounted] = useState(false)
  const staffLink = getStaffUserButtonLink(staffEntry)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setMounted(true)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  if (!mounted) {
    return <div aria-hidden="true" className="h-8 w-28 shrink-0" />
  }

  return <StaffUserButton staffLink={staffLink} pathname={pathname} />
}

export function StaffUserButton({
  staffLink,
  pathname = "/dashboard",
}: {
  staffLink: StaffUserButtonLink | null
  pathname?: string
}) {
  const clerk = useClerk()
  const inBilling = pathname === "/billing" || pathname.startsWith("/billing/")
  const hasDashboardNavigation =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/")
  const showDashboardLink =
    !hasDashboardNavigation && staffLink?.href !== "/dashboard"

  const handleSignOut = () => {
    const signOut = () => clerk.signOut()
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (update: () => Promise<void>) => void
    }

    if (viewTransitionDocument.startViewTransition) {
      viewTransitionDocument.startViewTransition(signOut)
      return
    }

    void signOut()
  }

  return (
    <UserButton
      userProfileMode="navigation"
      userProfileUrl="/account"
      appearance={{
        elements: {
          userButtonPopoverActionButton__signOut: { display: "none" },
        },
      }}
      showName
    >
      <UserButton.MenuItems>
        {showDashboardLink ? (
          <UserButton.Link
            href="/dashboard"
            label="Back to dashboard"
            labelIcon={<IconHome aria-hidden size={16} />}
          />
        ) : null}
        {!inBilling ? (
          <UserButton.Link
            href="/billing"
            label="Billing"
            labelIcon={<IconCreditCard aria-hidden size={16} />}
          />
        ) : null}
        {staffLink ? (
          <UserButton.Link
            href={staffLink.href}
            label={staffLink.label}
            labelIcon={
              staffLink.icon === "shield-lock" ? (
                <IconShieldLock aria-hidden size={16} />
              ) : (
                <IconHome aria-hidden size={16} />
              )
            }
          />
        ) : null}
        <UserButton.Action label="manageAccount" />
        <UserButton.Action
          label="Sign out"
          labelIcon={<IconLogout aria-hidden size={16} />}
          onClick={handleSignOut}
        />
      </UserButton.MenuItems>
    </UserButton>
  )
}
