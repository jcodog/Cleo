import { auth } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { redirect } from "next/navigation"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { getConvexAuthToken } from "@/lib/convex-auth"
import { applicationEntryPath } from "@/features/auth/applicationEntry"

export default async function Page() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  const token = await getConvexAuthToken()
  const onboarding = await fetchQuery(
    api.queries.dashboard.account.onboarding.get,
    {},
    { token }
  )
  redirect(applicationEntryPath(onboarding))
}
