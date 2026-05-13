import { UserButton } from "@clerk/nextjs"
import { auth, currentUser } from "@clerk/nextjs/server"

import { ConvexUserResult } from "./convex-user-result"

function displayNameForUser(user: {
  email: string
  firstName: string | null
  lastName: string | null
}) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
}

export default async function DashboardPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  const user = await currentUser()
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "No email address"
  const displayName = displayNameForUser({
    email,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
  })

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium">Dashboard</h1>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {displayName}
          </p>
        </div>
        <UserButton />
      </header>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="font-heading text-base font-medium">Clerk user</h2>
          <dl className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-words">{email}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Clerk ID</dt>
              <dd className="break-all font-mono text-xs">
                {authResult.userId}
              </dd>
            </div>
          </dl>
        </section>

        <ConvexUserResult />
      </div>
    </main>
  )
}
