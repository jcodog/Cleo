"use client"

import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react"

function ConvexUserDetails() {
  const user = useQuery(api.queries.dashboard.account.currentUser.get)

  if (user === undefined) {
    return <p className="text-muted-foreground">Loading Convex user...</p>
  }

  if (user === null) {
    return <p className="text-muted-foreground">No Convex user found.</p>
  }

  return (
    <pre className="bg-muted overflow-auto rounded-md p-3 text-xs leading-relaxed">
      {JSON.stringify(
        {
          id: user._id,
          clerkUserId: user.clerkUserId,
          email: user.email,
          displayName: user.displayName ?? null,
          role: user.role,
        },
        null,
        2
      )}
    </pre>
  )
}

export function ConvexUserResult() {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-heading text-base font-medium">Convex user</h2>
      <AuthLoading>
        <p className="text-muted-foreground">Connecting to Convex...</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">Convex auth is not active.</p>
      </Unauthenticated>
      <Authenticated>
        <ConvexUserDetails />
      </Authenticated>
    </section>
  )
}
