import type { Metadata } from "next"
import { PersonalBilling } from "@/features/account/PersonalBilling"
import { BackendBoundary } from "@/features/app-shell/BackendBoundary"

export const metadata: Metadata = { title: "Billing" }

export default function BillingPage() {
  return <BackendBoundary feature="Billing"><PersonalBilling /></BackendBoundary>
}
