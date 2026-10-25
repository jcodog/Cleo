import { auth } from "@clerk/nextjs/server"
import { AccountRoles } from "@/features/community/AccountRoles"
export default async function Page() {
  await auth.protect()
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <h1 className="font-heading text-2xl font-medium">Linked Roles</h1>
      <AccountRoles />
    </div>
  )
}
