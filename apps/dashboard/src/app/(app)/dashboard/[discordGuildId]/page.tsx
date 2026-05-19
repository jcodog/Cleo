import { auth } from "@clerk/nextjs/server"

type DiscordGuildWorkspacePageProps = {
  params: Promise<{
    discordGuildId: string
  }>
}

export default async function DiscordGuildWorkspacePage({
  params,
}: DiscordGuildWorkspacePageProps) {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  const { discordGuildId } = await params

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">
          Discord Server
        </h1>
        <p className="text-sm text-muted-foreground">{discordGuildId}</p>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Server workspace settings will be added after the backend and install
          flows are ready.
        </p>
      </section>
    </main>
  )
}
