import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"
import { ChatTimers } from "@/features/twitch/ChatTimers"

export const metadata: Metadata = { title: "Twitch chatbot timers" }
export default async function TimersPage() {
  await auth.protect()
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">Chatbot timers</h1>
        <p className="text-sm text-muted-foreground">
          Rotate helpful messages while your stream and chat are active. Cleo
          runs your timers in the cloud.
        </p>
      </header>
      <ChatTimers />
    </div>
  )
}
