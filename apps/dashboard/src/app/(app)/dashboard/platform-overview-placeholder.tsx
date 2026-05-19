const DISCORD_METRICS = [
  { label: "Servers", value: "-", detail: "Awaiting sync" },
  { label: "Members", value: "-", detail: "Select a server" },
  { label: "Modules", value: "-", detail: "Not configured" },
  { label: "Moderation", value: "-", detail: "No events loaded" },
] as const

export function PlatformOverviewPlaceholder() {
  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-medium">
            Discord Dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a Discord server to open server-level controls.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {DISCORD_METRICS.map((metric) => (
          <section
            key={metric.label}
            className="flex min-h-32 flex-col justify-between rounded-lg border bg-card p-4"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {metric.label}
            </p>
            <div className="flex flex-col gap-1">
              <p className="font-heading text-3xl font-medium tabular-nums">
                {metric.value}
              </p>
              <p className="text-sm text-muted-foreground">{metric.detail}</p>
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
