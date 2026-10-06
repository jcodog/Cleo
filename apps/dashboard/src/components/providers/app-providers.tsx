"use client"

import { useEffect, type ReactNode } from "react"
import { ClerkProvider, useAuth, useClerk } from "@clerk/nextjs"
import { dark, shadcn } from "@clerk/ui/themes"
import { ConvexProviderWithClerk } from "convex/react-clerk"

import { useTheme } from "@/components/providers/theme-provider"
import { convexClient } from "@/lib/convexClient"

export function AppProviders({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme()

  if (!convexClient) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL must be set to initialize Convex.")
  }

  return (
    <ClerkProvider
      appearance={{
        theme: resolvedTheme === "dark" ? [dark, shadcn] : [shadcn],
      }}
      afterSignOutUrl="/?s=sign-out"
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        <PendingRequestsGuard client={convexClient} />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

export function PendingRequestsGuard({
  client,
}: {
  client: { connectionState: () => { hasInflightRequests: boolean } }
}) {
  const clerk = useClerk()

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!clerk.session || !client.connectionState().hasInflightRequests)
        return
      event.preventDefault()
      event.returnValue = "Your changes may not be saved."
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [client, clerk])

  return null
}
