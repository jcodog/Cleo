"use client"

import { useEffect, useState } from "react"
import { UserButton } from "@clerk/nextjs"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { ThemeToggle } from "@/components/ThemeToggle"

export function AppTopbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="my-auto h-5" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">CleoAI Dashboard</p>
      </div>

      <MountedUserButton />
      <ThemeToggle />
    </header>
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
