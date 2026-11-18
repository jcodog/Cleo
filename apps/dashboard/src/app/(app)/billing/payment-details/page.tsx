import { PersonalBilling } from "@/features/account/PersonalBilling"
import { BackendBoundary } from "@/features/app-shell/BackendBoundary"

export const metadata = { title: "Payment details" }
export default function PaymentDetailsPage() {
  return (
    <BackendBoundary feature="Billing">
      <PersonalBilling view="payment-details" />
    </BackendBoundary>
  )
}
