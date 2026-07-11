"use client"

import { useEffect, useState } from "react"
import { UserButton } from "@clerk/nextjs"
import { IconHome, IconShieldLock } from "@tabler/icons-react"
import Link from "next/link"

import { buttonVariants } from "@workspace/ui/components/button"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { ThemeToggle } from "@/components/ThemeToggle"
import type { StaffTopbarEntry } from "@/features/app-shell/staffAccess"

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

      {staffEntry ? <StaffEntryButton entry={staffEntry} /> : null}
      <MountedUserButton />
      <ThemeToggle />
    </header>
  )
}

function StaffEntryButton({ entry }: { entry: StaffTopbarEntry }) {
  const Icon = entry.mode === "dashboard" ? IconHome : IconShieldLock

  return (
    <Link
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
      href={entry.href}
    >
      <Icon aria-hidden data-icon="inline-start" />
      <span className="hidden sm:inline">{entry.label}</span>
      <span className="sr-only sm:hidden">{entry.label}</span>
    </Link>
  )
}

function MountedUserButton() {
  const [mounted, setMounted] = useState(false)

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

  return <UserButton showName />
}
