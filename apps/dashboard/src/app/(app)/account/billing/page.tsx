import { auth } from "@clerk/nextjs/server"
import { PremiumPurchases } from "@/features/community/PremiumPurchases"
export default async function Page() {
  await auth.protect()
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <h1 className="font-heading text-2xl font-medium">My billing</h1>
      <p className="text-sm">
        Returning from Checkout does not activate Premium. Payment status is
        verified by the backend.
      </p>
      <PremiumPurchases />
    </div>
  )
}
