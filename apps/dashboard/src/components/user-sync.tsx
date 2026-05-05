"use client"

import * as React from "react"
import { useUser } from "@clerk/nextjs"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Authenticated, useMutation } from "convex/react"

function UserSyncInner() {
  const { isLoaded, user } = useUser()
  const upsertFromAuth = useMutation(api.mutations.users.auth.upsertFromAuth)
  const lastSyncKey = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!isLoaded) {
      return
    }

    if (!user) {
      lastSyncKey.current = null
      return
    }

    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress

    if (!email) {
      return
    }

    const displayName = user.fullName ?? user.username ?? undefined
    const imageUrl = user.imageUrl || undefined
    const syncKey = JSON.stringify([user.id, email, displayName, imageUrl])

    if (lastSyncKey.current === syncKey) {
      return
    }

    lastSyncKey.current = syncKey

    void upsertFromAuth({
      email,
      displayName,
      imageUrl,
    }).catch(() => {
      lastSyncKey.current = null
    })
  }, [isLoaded, upsertFromAuth, user])

  return null
}

export function UserSync() {
  return (
    <Authenticated>
      <UserSyncInner />
    </Authenticated>
  )
}
