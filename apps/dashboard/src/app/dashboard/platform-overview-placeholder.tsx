"use client"

import { useAppShellStore } from "@/components/stores/app-shell-store"

const PLATFORM_COPY = {
  discord: {
    title: "Discord Overview",
    emptyCopy: "Connect Discord to populate server-level controls.",
    metrics: [
      { label: "Servers", value: "—", detail: "Awaiting connection" },
      { label: "Members", value: "—", detail: "Select a server" },
      { label: "Modules", value: "—", detail: "Not configured" },
      { label: "Moderation", value: "—", detail: "No events loaded" },
    ],
  },
  kick: {
    title: "Kick Overview",
    emptyCopy: "Connect Kick to populate channel tools.",
    metrics: [
      { label: "Channels", value: "—", detail: "Awaiting connection" },
      { label: "Commands", value: "—", detail: "Not configured" },
      { label: "Overlays", value: "—", detail: "No overlays loaded" },
      { label: "Live Tools", value: "—", detail: "Offline" },
    ],
  },
  twitch: {
    title: "Twitch Overview",
    emptyCopy: "Connect Twitch to populate channel tools.",
    metrics: [
      { label: "Channels", value: "—", detail: "Awaiting connection" },
      { label: "EventSub", value: "—", detail: "No subscriptions loaded" },
      { label: "Overlays", value: "—", detail: "No overlays loaded" },
      { label: "Live Tools", value: "—", detail: "Offline" },
    ],
  },
} as const

export function PlatformOverviewPlaceholder() {
  const selectedPlatform = useAppShellStore((state) => state.selectedPlatform)
  const copy = PLATFORM_COPY[selectedPlatform]

  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-medium">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.emptyCopy}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {copy.metrics.map((metric) => (
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
