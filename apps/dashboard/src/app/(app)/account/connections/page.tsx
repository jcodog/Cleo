import { auth } from "@clerk/nextjs/server"
import { AccountConnections } from "@/features/account/AccountConnections"

export default async function Page() {
  await auth.protect()
  return <AccountConnections />
}
