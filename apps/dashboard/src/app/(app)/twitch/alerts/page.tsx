import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"
import { TwitchWorkspace } from "@/features/twitch/TwitchWorkspace"

export const metadata: Metadata = { title: "Twitch chat alerts" }
export default async function AlertsPage() {
  await auth.protect()
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">Chat alerts</h1>
        <p className="text-sm text-muted-foreground">
          Choose the events Cleo announces in your Twitch chat.
        </p>
      </header>
      <TwitchWorkspace view="alerts" />
    </div>
  )
}
