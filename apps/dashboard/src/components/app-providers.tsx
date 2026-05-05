"use client"

import * as React from "react"
import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from "@workos-inc/authkit-nextjs/components"
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"

import { UserSync } from "@/components/user-sync"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

function useWorkOSAuthForConvex() {
  const { loading, user } = useAuth()
  const {
    getAccessToken,
    loading: accessTokenLoading,
    refresh,
  } = useAccessToken()

  const fetchAccessToken = React.useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) {
        return null
      }

      const accessToken = forceRefreshToken
        ? await refresh()
        : await getAccessToken()

      return accessToken ?? null
    },
    [getAccessToken, refresh, user]
  )

  return {
    isLoading: loading || (Boolean(user) && accessTokenLoading),
    isAuthenticated: Boolean(user),
    fetchAccessToken,
  }
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (!convex) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL must be set to initialize Convex.")
  }

  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useWorkOSAuthForConvex}>
        <UserSync />
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  )
}
