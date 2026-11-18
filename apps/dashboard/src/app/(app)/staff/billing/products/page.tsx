import { auth } from "@clerk/nextjs/server"
import { BillingProducts } from "@/features/staff/BillingProducts"
export default async function Page() {
  await auth.protect()
  return <BillingProducts />
}
