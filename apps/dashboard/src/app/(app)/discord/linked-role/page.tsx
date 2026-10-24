import { auth } from "@clerk/nextjs/server"
import { AccountRoles } from "@/features/community/AccountRoles"
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>
}) {
  await auth.protect()
  const params = await searchParams
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <h1 className="font-heading text-2xl font-medium">
        Discord Linked Roles
      </h1>
      <AccountRoles
        code={params.code}
        state={params.state}
        error={params.error}
      />
    </div>
  )
}
