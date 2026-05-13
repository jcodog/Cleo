import { auth } from "@clerk/nextjs/server"

import { PlatformOverviewPlaceholder } from "./platform-overview-placeholder"

export default async function DashboardPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium">Overview</h1>
        </div>
      </header>

      <PlatformOverviewPlaceholder />
    </main>
  )
}
