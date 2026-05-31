"use client"

import { type ReactNode } from "react"
import { ClerkProvider, useAuth } from "@clerk/nextjs"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { dark, shadcn } from "@clerk/themes"
import { useTheme } from "next-themes"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

export function AppProviders({ children }: { children: ReactNode }) {
  if (!convex) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL must be set to initialize Convex.")
  }
  const { resolvedTheme } = useTheme()

  return (
    <ClerkProvider
      appearance={{
        theme: resolvedTheme === "dark" ? [dark, shadcn] : [shadcn],
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
