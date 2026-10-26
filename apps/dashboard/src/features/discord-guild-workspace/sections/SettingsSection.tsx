import Link from "next/link"
import type { GuildOverview } from "../types"

/** Legacy route only; the sidebar no longer links to an empty Settings page. */
export function SettingsSection({ overview }: { overview: GuildOverview }) {
  return (
    <section className="max-w-xl space-y-3 text-sm">
      <p className="text-muted-foreground">
        Premium Guild now has its own section. Server access is verified
        automatically when you open a guild, so there is no separate status
        panel to refresh.
      </p>
      <Link
        className="font-medium text-primary underline-offset-4 hover:underline"
        href={`/dashboard/${overview.discordGuildId}/premium`}
      >
        Open Premium Guild
      </Link>
    </section>
  )
}
