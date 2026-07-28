import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Twitch",
}

export default async function TwitchPage() {
  await auth.protect()

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">Twitch</h1>
        <p className="text-sm text-muted-foreground">
          Twitch workspace surfaces will be added in a later pass.
        </p>
      </header>
    </main>
  )
}
