import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

const DISCORD_SECTIONS = new Set([
  "modules",
  "moderation",
  "automation",
  "commands",
  "logs",
  "settings",
])

const SECTION_TITLES: Record<string, string> = {
  modules: "Modules",
  moderation: "Moderation",
  automation: "Automation",
  commands: "Commands",
  logs: "Logs",
  settings: "Settings",
}

type DiscordGuildSectionPageProps = {
  params: Promise<{
    discordGuildId: string
    section: string
  }>
}

export default async function DiscordGuildSectionPage({
  params,
}: DiscordGuildSectionPageProps) {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  const { discordGuildId, section } = await params

  if (!DISCORD_SECTIONS.has(section)) {
    notFound()
  }

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">
          {SECTION_TITLES[section]}
        </h1>
        <p className="text-sm text-muted-foreground">{discordGuildId}</p>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          This Discord server section will be wired after the backend and
          install flows are ready.
        </p>
      </section>
    </main>
  )
}
