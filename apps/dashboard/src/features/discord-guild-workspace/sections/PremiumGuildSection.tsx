import { PremiumPurchases } from "@/features/community/PremiumPurchases"
import type { GuildOverview } from "../types"

/** Guild-scoped Premium is independent of generic server settings and account billing. */
/** Attach Premium's dedicated page to the explicitly selected server. */
export function PremiumGuildSection({ overview }: { overview: GuildOverview }) {
  return (
    <div className="w-full max-w-4xl min-w-0">
      <PremiumPurchases
        key={overview.discordGuildId}
        discordGuildId={overview.discordGuildId}
        showCommunityHeader={false}
      />
    </div>
  )
}
