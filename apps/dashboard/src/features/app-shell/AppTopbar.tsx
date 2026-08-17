"use client"

import { useEffect, useState } from "react"
import { UserButton } from "@clerk/nextjs"
import { IconHome, IconShieldLock } from "@tabler/icons-react"

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
}: {
  staffEntry?: StaffTopbarEntry | null
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="my-auto h-5" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">CleoAI Dashboard</p>
      </div>

      <MountedUserButton staffEntry={staffEntry} />
      <ThemeToggle />
    </header>
  )
}

function MountedUserButton({
  staffEntry,
}: {
  staffEntry: StaffTopbarEntry | null
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

  return <StaffUserButton staffLink={staffLink} />
}

export function StaffUserButton({
  staffLink,
}: {
  staffLink: StaffUserButtonLink | null
}) {
  return (
    <UserButton showName>
      {staffLink ? (
        <UserButton.MenuItems>
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
        </UserButton.MenuItems>
      ) : null}
    </UserButton>
  )
}
