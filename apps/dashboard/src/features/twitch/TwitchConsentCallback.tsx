"use client"

import { useEffect, useRef, useState } from "react"
import { useAction } from "convex/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { api } from "@workspace/backend/convex/_generated/api.js"

export function TwitchConsentCallback() {
  const params = useSearchParams()
  const router = useRouter()
  const finish = useAction(api.twitchConsentActions.finish)
  const started = useRef(false)
  const [request] = useState(() => ({
    code: params.get("code"),
    state: params.get("state"),
    denied: params.has("error"),
  }))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const { code, state, denied } = request
    window.history.replaceState(null, "", "/twitch/chat-consent")
    if (denied || !code || !state) {
      return
    }
    void finish({ code, state })
      .then(() => router.replace("/twitch"))
      .catch(() => setFailed(true))
  }, [request, finish, router])
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <p role="status">
        {failed || request.denied || !request.code || !request.state
          ? "Chatbot authorization could not be verified. Start authorization again from your Twitch workspace."
          : "Verifying Twitch chatbot authorization..."}
      </p>
      <Link href="/twitch" className="text-sm underline underline-offset-4">
        Return to Twitch
      </Link>
    </section>
  )
}
