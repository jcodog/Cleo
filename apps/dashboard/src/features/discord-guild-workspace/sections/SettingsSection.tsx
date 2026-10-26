import Link from "next/link"

/** Legacy route only; the sidebar no longer links to an empty Settings page. */
/** Preserve legacy Settings links while directing billing to the dedicated Premium page. */
export function SettingsSection({
  discordGuildId,
}: {
  discordGuildId: string
}) {
  return (
    <section className="max-w-xl space-y-3 text-sm">
      <p className="text-muted-foreground">
        Premium Guild has moved to its own section.
      </p>
      <Link
        className="font-medium text-primary underline-offset-4 hover:underline"
        href={`/dashboard/${discordGuildId}/premium`}
      >
        Open Premium Guild
      </Link>
    </section>
  )
}
