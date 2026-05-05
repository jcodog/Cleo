"use client"

import * as React from "react"
import { useAuth } from "@workos-inc/authkit-nextjs/components"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Authenticated, useMutation } from "convex/react"

function displayNameForUser(user: {
  firstName: string | null
  lastName: string | null
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ")

  return name || undefined
}

function UserSyncInner() {
  const { user } = useAuth()
  const upsertFromAuth = useMutation(api.mutations.users.auth.upsertFromAuth)
  const lastSyncKey = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!user) {
      lastSyncKey.current = null
      return
    }

    const displayName = displayNameForUser(user)
    const imageUrl = user.profilePictureUrl ?? undefined
    const syncKey = JSON.stringify([
      user.id,
      user.email,
      displayName,
      imageUrl,
    ])

    if (lastSyncKey.current === syncKey) {
      return
    }

    lastSyncKey.current = syncKey

    void upsertFromAuth({
      email: user.email,
      displayName,
      imageUrl,
    }).catch(() => {
      lastSyncKey.current = null
    })
  }, [upsertFromAuth, user])

  return null
}

export function UserSync() {
  return (
    <Authenticated>
      <UserSyncInner />
    </Authenticated>
  )
}
