import { auth } from "@clerk/nextjs/server"
import { Suspense } from "react"
import type { Metadata } from "next"
import { TwitchConsentCallback } from "@/features/twitch/TwitchConsentCallback"

export const metadata: Metadata = { referrer: "no-referrer" }
export const dynamic = "force-dynamic"

export default async function TwitchConsentPage() {
  await auth.protect()
  return (
    <Suspense fallback={<p>Loading Twitch authorization...</p>}>
      <TwitchConsentCallback />
    </Suspense>
  )
}
