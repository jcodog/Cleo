import { withAuth } from "@workos-inc/authkit-nextjs"
import { Button } from "@workspace/ui/components/button"

import { ConvexUserResult } from "./convex-user-result"
import { signOutAction } from "./actions"

function displayNameForUser(user: {
  email: string
  firstName: string | null
  lastName: string | null
}) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
}

export default async function DashboardPage() {
  const { user } = await withAuth({ ensureSignedIn: true })

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium">Dashboard</h1>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {displayNameForUser(user)}
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </header>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="font-heading text-base font-medium">WorkOS user</h2>
          <dl className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-words">{user.email}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">WorkOS ID</dt>
              <dd className="break-all font-mono text-xs">{user.id}</dd>
            </div>
          </dl>
        </section>

        <ConvexUserResult />
      </div>
    </main>
  )
}
