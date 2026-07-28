import { IconArrowLeft } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"

import { DotGrid } from "@/components/backgrounds/DotGrid"

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="dark relative grid min-h-svh overflow-hidden bg-[#07090c] text-foreground lg:grid-cols-[1.04fr_0.96fr]">
      <header className="absolute inset-x-0 top-0 z-20 flex h-20 items-center justify-between px-5 sm:h-24 sm:px-10 lg:px-14 xl:px-20">
        <Link
          className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/"
        >
          <Image
            alt=""
            className="size-8 rounded-full border border-white/15"
            height={32}
            priority
            src="/android-chrome-192x192.png"
            width={32}
          />
          <span className="font-heading text-lg font-semibold">Cleo</span>
        </Link>
        <Link
          className="flex items-center gap-2 rounded-lg text-sm text-foreground/72 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/"
        >
          <IconArrowLeft aria-hidden className="size-4" />
          Back to landing
        </Link>
      </header>

      <div
        aria-hidden="true"
        className="relative h-44 overflow-hidden border-b border-white/10 bg-[#06090c] sm:h-60 lg:h-svh lg:min-h-[38rem] lg:border-r lg:border-b-0"
      >
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_12%,rgba(0,0,0,0.92)_58%,transparent_100%)]">
          <DotGrid
            activeColor="#d946ef"
            baseColor="#155e75"
            dotSize={4}
            gap={24}
            idleAnimation
            idleColor="#22d3ee"
            idlePulseInterval={5.5}
            idlePulseRadius={72}
            idleStrength={0.48}
            maxSpeed={1800}
            proximity={145}
            resistance={1050}
            returnDuration={2.1}
            shockRadius={160}
            shockStrength={1.6}
            speedTrigger={240}
          />
        </div>
      </div>

      <section className="flex min-h-[calc(100svh-11rem)] flex-col px-5 pt-20 sm:min-h-[calc(100svh-15rem)] sm:px-10 sm:pt-24 lg:min-h-svh lg:px-14 xl:px-20">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-start gap-8 pt-8 pb-10 sm:justify-center sm:py-14 lg:pb-24">
          {children}
        </div>
      </section>
    </main>
  )
}
