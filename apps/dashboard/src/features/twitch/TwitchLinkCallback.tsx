"use client"

import { useUser } from "@clerk/nextjs"
import { useAction } from "convex/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  getTwitchLinkState,
  twitchProviderError,
  twitchReturnPath,
} from "./linking"

export function TwitchLinkCallback() {
  const { user, isLoaded } = useUser()
  const params = useSearchParams()
  const router = useRouter()
  const sync = useAction(api.actions.dashboard.account.syncLinkedAccounts.sync)
  const started = useRef(false)
  const providerError = twitchProviderError(params.get("error"))
  const [failure, setFailure] = useState<string | null>(null)
  const returnTo = twitchReturnPath(params.get("returnTo"))
  useEffect(() => {
    if (!isLoaded || !user || started.current || providerError) return
    started.current = true
    void (async () => {
      try {
        // Clerk completes external-account verification at its own OAuth callback.
        // This authenticated return page reloads that verified account, then syncs.
        const current = await user.reload()
        const state = getTwitchLinkState(current.externalAccounts)
        if (state === "notConnected" || state === "reconnectRequired") {
          setFailure(
            "Twitch did not verify the connection. Reconnect from your Twitch workspace."
          )
          return
        }
        const result = await sync({})
        if (result.status !== "ready") {
          setFailure(
            "The account provider is unavailable. Retry sync from your Twitch workspace."
          )
          return
        }
        router.replace(returnTo)
      } catch {
        setFailure(
          "Cleo could not verify the Twitch connection. Try reconnecting."
        )
      }
    })()
  }, [isLoaded, user, providerError, returnTo, router, sync])
  const error = providerError ?? failure
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Twitch connection incomplete</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center gap-2">
          <Spinner />
          Verifying your Twitch connection...
        </p>
      )}
      <Link href="/twitch" className="text-sm underline underline-offset-4">
        Return to Twitch
      </Link>
    </section>
  )
}
