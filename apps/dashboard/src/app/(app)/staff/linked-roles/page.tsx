import { auth } from "@clerk/nextjs/server"
import { LinkedRoleTesting } from "@/features/staff/LinkedRoleTesting"
export default async function Page() {
  await auth.protect()
  return <LinkedRoleTesting />
}
