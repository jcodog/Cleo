import { auth } from "@clerk/nextjs/server"
import { BillingProducts } from "@/features/staff/BillingProducts"
export default async function Page({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  await auth.protect()
  const { productId } = await params
  return <BillingProducts productId={productId} />
}
