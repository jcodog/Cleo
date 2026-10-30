"use client"

import { useAuth, useClerk } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { signInPath } from "./applicationEntry"

/** Retry a rejected session without rendering protected data or starting another OAuth flow. */
export function SessionRecovery({ returnTo }: { returnTo: string }) {
  const { getToken, sessionId, sessionClaims } = useAuth()
  const clerk = useClerk()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function retry() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const audience = sessionClaims?.aud
      const hasConvexAudience = Array.isArray(audience)
        ? audience.includes("convex")
        : audience === "convex"
      if (
        !(await getToken({
          skipCache: true,
          ...(hasConvexAudience ? {} : { template: "convex" }),
        }))
      )
        throw new Error("Session unavailable")
      router.refresh()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto w-full max-w-xl space-y-5 px-6 py-12">
      <h1 className="font-heading text-xl font-medium">
        Reconnect your session
      </h1>
      <p role="alert" className="text-sm leading-6 text-muted-foreground">
        Cleo could not verify your session with the backend. Retry with a fresh
        session, or sign in again.
      </p>
      {failed ? (
        <p role="status" className="text-sm text-destructive">
          Your session could not be refreshed. Please sign in again.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={retry}>
          {busy ? "Refreshing session…" : "Retry session"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            clerk.signOut({
              ...(sessionId ? { sessionId } : {}),
              redirectUrl: signInPath(returnTo),
            })
          }
        >
          Sign in again
        </Button>
      </div>
    </main>
  )
}
