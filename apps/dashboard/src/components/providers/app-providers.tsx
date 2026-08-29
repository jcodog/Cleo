"use client"

import { type ReactNode } from "react"
import { ClerkProvider, useAuth } from "@clerk/nextjs"
import { dark, shadcn } from "@clerk/ui/themes"
import { ConvexProviderWithClerk } from "convex/react-clerk"

import { useTheme } from "@/components/providers/theme-provider"
import { convexClient } from "@/lib/convexClient"

type AppProvidersProps = {
  afterSignOutUrl: string
  children: ReactNode
}

export function AppProviders({
  afterSignOutUrl,
  children,
}: AppProvidersProps) {
  const { resolvedTheme } = useTheme()

  if (!convexClient) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL must be set to initialize Convex.")
  }

  return (
    <ClerkProvider
      afterSignOutUrl={afterSignOutUrl}
      appearance={{
        theme: resolvedTheme === "dark" ? [dark, shadcn] : [shadcn],
      }}
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
