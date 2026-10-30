import { auth } from "@clerk/nextjs/server"
import { AccountProfile } from "@/features/account/AccountProfile"

export const metadata = { title: "Account" }

export default async function AccountPage() {
  await auth.protect()
  return <AccountProfile />
}
