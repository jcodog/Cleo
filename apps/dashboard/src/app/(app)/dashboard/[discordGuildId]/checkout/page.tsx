import { auth } from "@clerk/nextjs/server"
import { CheckoutReturn } from "@/features/community/PremiumCheckout"
import Link from "next/link"

export const metadata = { title: "Premium checkout" }

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ discordGuildId: string }>
  searchParams: Promise<{ session_id?: string | string[] }>
}) {
  await auth.protect()
  const { discordGuildId } = await params
  const { session_id: sessionId } = await searchParams
  if (
    typeof sessionId !== "string" ||
    !/^cs_test_[a-zA-Z0-9]+$/.test(sessionId)
  )
    return (
      <p className="py-6 text-sm">
        No valid test checkout was provided.{" "}
        <Link
          href={`/dashboard/${discordGuildId}/premium`}
          className="underline"
        >
          Return to Premium
        </Link>
      </p>
    )
  return (
    <CheckoutReturn
      key={sessionId}
      discordGuildId={discordGuildId}
      sessionId={sessionId}
    />
  )
}
