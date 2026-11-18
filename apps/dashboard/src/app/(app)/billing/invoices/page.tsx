import { PersonalBilling } from "@/features/account/PersonalBilling"
import { BackendBoundary } from "@/features/app-shell/BackendBoundary"

export const metadata = { title: "Invoices" }
export default function InvoicesPage() {
  return (
    <BackendBoundary feature="Billing">
      <PersonalBilling view="invoices" />
    </BackendBoundary>
  )
}
