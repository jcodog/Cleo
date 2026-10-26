import { PremiumPurchases } from "@/features/community/PremiumPurchases"
import type { GuildOverview } from "../types"

/** Guild-scoped Premium is independent of generic server settings and account billing. */
export function PremiumGuildSection({ overview }: { overview: GuildOverview }) {
  return (
    <div className="min-w-0 w-full max-w-4xl">
      <PremiumPurchases discordGuildId={overview.discordGuildId} />
    </div>
  )
}
