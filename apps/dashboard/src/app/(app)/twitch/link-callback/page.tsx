import { auth } from "@clerk/nextjs/server"
import { Suspense } from "react"
import { TwitchLinkCallback } from "@/features/twitch/TwitchLinkCallback"

export default async function TwitchLinkCallbackPage() {
  await auth.protect()
  return (
    <Suspense fallback={<p>Loading Twitch connection...</p>}>
      <TwitchLinkCallback />
    </Suspense>
  )
}
