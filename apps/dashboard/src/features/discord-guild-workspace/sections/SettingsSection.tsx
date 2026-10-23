import { PremiumPurchases } from "@/features/community/PremiumPurchases"
import { BotStatusFields, OverviewField } from "../components/workspace-ui"
import type { GuildOverview } from "../types"

/** Present verified management access and persisted bot-presence timestamps without editing them. */
export function SettingsSection({
  isBotLeft,
  overview,
}: {
  isBotLeft: boolean
  overview: GuildOverview
}) {
  return (
    <section
      className="max-w-2xl min-w-0 space-y-5"
      aria-labelledby="server-access-heading"
    >
      <header className="space-y-2">
        <h2
          className="font-heading text-base font-medium"
          id="server-access-heading"
        >
          Server access
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Current Cleo presence and your verified management access.
        </p>
      </header>
      <div className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <OverviewField label="Server" value={overview.name} />
          <OverviewField
            label="Management access"
            value={overview.membership.isOwner ? "Owner" : "Manager"}
          />
          <BotStatusFields isBotLeft={isBotLeft} overview={overview} />
        </dl>
      </div>
      <PremiumPurchases discordGuildId={overview.discordGuildId} />
    </section>
  )
}
