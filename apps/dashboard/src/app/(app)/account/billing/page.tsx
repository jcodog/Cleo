import { auth } from "@clerk/nextjs/server"
import { PersonalBilling } from "@/features/account/PersonalBilling"
export default async function Page() {
  await auth.protect()
  return <PersonalBilling />
}
