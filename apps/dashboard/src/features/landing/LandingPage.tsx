import {
  IconAdjustments,
  IconBrandDiscord,
  IconBrandKick,
  IconBrandTwitch,
  IconCheck,
  IconEye,
  IconHeartHandshake,
  IconMessageChatbot,
  IconServer,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"
import Link from "next/link"

import { LandingAuthActions } from "./LandingAuthActions"

export function LandingPage() {
  return (
    <main className="dark min-h-svh overflow-hidden bg-background text-foreground">
      <div className="cleo-atmosphere relative isolate overflow-hidden">
        <LandingNavigation />
        <Hero />
        <ValueSummary />
        <ProductShowcase />
        <CoreCapabilities />
        <PlatformEcosystem />
        <TrustAndControl />
        <CleoPersonality />
        <FinalCallToAction />
        <LandingFooter />
      </div>
    </main>
  )
}

function LandingNavigation() {
  return (
    <header className="relative z-30 mx-auto flex h-[4.25rem] w-full max-w-[90rem] items-center justify-between px-5 sm:h-[4.75rem] sm:px-8 lg:px-12">
      <Link
        className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        href="/"
      >
        <Image
          alt=""
          className="size-9 rounded-full border border-white/15 object-cover"
          height={36}
          priority
          src="/android-chrome-192x192.png"
          width={36}
        />
        <span className="font-heading text-xl font-semibold tracking-tight">
          Cleo
        </span>
      </Link>

      <nav aria-label="Main navigation" className="flex items-center gap-1.5">
        <a className={navigationLinkClassName} href="#product">
          Product
        </a>
        <a className={navigationLinkClassName} href="#features">
          Features
        </a>
        <a className={navigationLinkClassName} href="#platforms">
          Platforms
        </a>
        <a className={navigationLinkClassName} href="#safety">
          Safety
        </a>
        <LandingAuthActions placement="navigation" />
      </nav>
    </header>
  )
}

const navigationLinkClassName =
  "hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:inline-flex"

function Hero() {
  return (
    <section className="relative mx-auto grid min-h-[calc(86svh-4.25rem)] w-full max-w-[90rem] items-center gap-4 px-5 pt-7 pb-10 sm:min-h-[calc(86svh-4.75rem)] sm:gap-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(34rem,1.12fr)] lg:gap-8 lg:px-12">
      <div className="cleo-enter relative z-10 flex max-w-2xl flex-col items-start gap-5 sm:gap-7 lg:pb-8">
        <p className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-cleo-cyan uppercase sm:text-sm">
          <IconBrandDiscord aria-hidden className="size-4" />
          Manage your Discord community with Cleo
        </p>

        <div className="flex flex-col gap-5">
          <h1 className="font-heading text-[clamp(3.25rem,4.5vw,4.25rem)] leading-[0.94] font-semibold tracking-[-0.045em] text-balance">
            Your Discord server,
            <span className="block text-cleo-cyan">easier to manage.</span>
          </h1>
          <p className="max-w-xl text-base leading-7 text-pretty text-foreground/76 sm:text-lg sm:leading-8">
            Set up welcomes, moderation, logs, support, and automations from
            one dashboard, with help from Cleo when you need it.
          </p>
        </div>

        <LandingAuthActions placement="hero" />
      </div>

      <CleoHeroVisual />
    </section>
  )
}

function CleoHeroVisual() {
  return (
    <div className="cleo-enter cleo-enter-delay relative mx-auto flex min-h-[23rem] w-full max-w-[44rem] items-center justify-center sm:min-h-[38rem] lg:mx-0 lg:min-h-[44rem] lg:justify-end">
      <div
        aria-hidden
        className="absolute inset-[4%] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_62%)] blur-2xl"
      />
      <div
        aria-hidden
        className="absolute right-[4%] size-[76%] rounded-full border border-primary/20 shadow-[0_0_90px_color-mix(in_oklab,var(--primary)_14%,transparent)]"
      />
      <div
        aria-hidden
        className="absolute right-[10%] size-[64%] rounded-full border border-white/10"
      />

      <div className="cleo-portrait-float relative z-0 mr-[2%] size-[min(72vw,19rem)] overflow-hidden rounded-full border border-white/15 bg-card shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:size-[28rem] lg:size-[32rem]">
        <Image
          alt="Cleo, the community assistant"
          className="size-full object-cover"
          height={512}
          priority
          sizes="(max-width: 640px) 72vw, 32rem"
          src="/android-chrome-512x512.png"
          width={512}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-full ring-1 ring-white/15 ring-inset"
        />
      </div>

      <div className="absolute bottom-[1%] left-1/2 z-20 grid w-[min(21rem,94%)] -translate-x-1/2 grid-cols-3 overflow-hidden rounded-xl border border-white/12 bg-neutral-950/94 shadow-xl shadow-black/40 backdrop-blur-xl sm:bottom-[4%] lg:left-[54%]">
        <PlatformMark icon={IconBrandDiscord} label="Discord" tone="cyan" />
        <PlatformMark icon={IconBrandTwitch} label="Twitch" tone="indigo" />
        <PlatformMark icon={IconBrandKick} label="Kick" tone="emerald" />
      </div>

      <div
        aria-hidden
        className="cleo-particle-a absolute top-[8%] left-[18%] size-2 rounded-full bg-primary shadow-[0_0_18px_var(--primary)] sm:left-[24%]"
      />
      <div
        aria-hidden
        className="cleo-particle-b absolute top-[20%] right-[2%] size-1.5 rounded-full bg-cleo-fuchsia shadow-[0_0_14px_var(--cleo-fuchsia)]"
      />
      <div
        aria-hidden
        className="cleo-particle-c absolute right-[12%] bottom-[4%] size-1.5 rounded-full bg-cleo-indigo shadow-[0_0_14px_var(--cleo-indigo)]"
      />
    </div>
  )
}

function PlatformMark({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof IconBrandDiscord
  label: string
  tone: "cyan" | "emerald" | "indigo"
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 border-r border-white/10 px-2 py-3.5 last:border-r-0 sm:py-4">
      <Icon
        aria-hidden
        className={cn(
          "size-6",
          tone === "cyan" && "text-cleo-cyan",
          tone === "indigo" && "text-cleo-indigo",
          tone === "emerald" && "text-emerald-400"
        )}
      />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

const VALUE_AREAS = [
  {
    icon: IconServer,
    title: "Manage your server",
    description:
      "Set up Cleo's Discord features without hunting through bot commands.",
  },
  {
    icon: IconShieldCheck,
    title: "Protect your members",
    description:
      "Give moderators clear settings and keep important outcomes easy to find.",
  },
  {
    icon: IconAdjustments,
    title: "Automate the routine",
    description:
      "Handle welcomes, logs, support, and repeatable server tasks.",
  },
  {
    icon: IconMessageChatbot,
    title: "Ask Cleo for help",
    description:
      "Use the context your team chooses while people make the final call.",
  },
] as const

function ValueSummary() {
  return (
    <section
      className="relative scroll-mt-20 border-t border-white/10"
      id="features"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
        <div className="max-w-3xl">
          <h2 className="font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            Less time chasing settings and bot commands.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Cleo keeps the everyday work of running a Discord server in one
            place.
          </p>
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_AREAS.map(({ description, icon: Icon, title }) => (
            <article
              className="group min-h-56 bg-neutral-950/92 p-6 transition-colors duration-200 hover:bg-neutral-900/94 sm:p-7"
              key={title}
            >
              <Icon
                aria-hidden
                className="size-6 text-cleo-cyan transition-colors duration-200 group-hover:text-white"
                stroke={1.5}
              />
              <h3 className="mt-8 font-heading text-xl font-semibold tracking-[-0.02em]">
                {title}
              </h3>
              <p className="mt-3 text-base leading-7 text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductShowcase() {
  return (
    <section
      className="relative scroll-mt-20 overflow-hidden border-y border-white/10 bg-neutral-950/55"
      id="product"
    >
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 h-80 w-[70rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_68%)] blur-2xl"
      />
      <div className="relative mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 sm:py-28 lg:px-10 lg:py-32">
        <div className="grid items-end gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <h2 className="max-w-3xl font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            See what is happening. Change what matters.
          </h2>
          <p className="max-w-xl text-base leading-7 text-muted-foreground sm:justify-self-end sm:text-lg sm:leading-8">
            Check Cleo's status, open a feature, and update your server without
            digging through commands or scattered settings.
          </p>
        </div>

        <figure className="mt-12 overflow-hidden rounded-xl border border-white/14 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.46)] sm:mt-16">
          <div className="flex h-11 items-center gap-2 border-b border-white/10 bg-neutral-950 px-4">
            <span aria-hidden className="size-2 rounded-full bg-white/18" />
            <span aria-hidden className="size-2 rounded-full bg-white/12" />
            <span aria-hidden className="size-2 rounded-full bg-white/8" />
            <span className="ml-3 text-sm text-muted-foreground">
              Cleo dashboard
            </span>
          </div>
          <div className="relative h-[28rem] overflow-hidden bg-black sm:aspect-[1.536] sm:h-auto">
            <Image
              alt="The real Cleo Discord server overview showing configuration and recent changes"
              className="origin-top-left scale-[1.55] object-cover object-left-top sm:scale-100 sm:object-contain"
              fill
              sizes="(max-width: 640px) 92vw, 80rem"
              src="/product/dashboard-overview.png"
            />
          </div>
        </figure>
      </div>
    </section>
  )
}

const CAPABILITY_PANELS = [
  {
    icon: IconAdjustments,
    title: "Server setup and automation",
    description:
      "Choose the Cleo features your server needs and configure them from the dashboard.",
    bullets: [
      "Welcome cards and channel destinations",
      "Moderation, logging, and support modules",
      "Access based on verified Discord permissions",
    ],
    lead: true,
  },
  {
    icon: IconShieldCheck,
    title: "Moderation and logs",
    description:
      "Cleo records ban and kick results and keeps moderation settings visible to authorised managers.",
    bullets: [
      "Configured moderation controls",
      "Clear results when an action succeeds or fails",
      "Owners and moderators make the decisions",
    ],
    lead: false,
  },
  {
    icon: IconSparkles,
    title: "AI help when it makes sense",
    description:
      "Use Cleo with the community context your team chooses. People still decide what happens next.",
    bullets: [
      "Context chosen by the community team",
      "Suggestions you can review before acting",
      "People always make the final call",
    ],
    lead: false,
  },
] as const

function CoreCapabilities() {
  return (
    <section className="relative" aria-labelledby="capabilities-heading">
      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <h2
          className="max-w-4xl font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl"
          id="capabilities-heading"
        >
          Set up the parts of your server people rely on.
        </h2>

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          {CAPABILITY_PANELS.map(
            ({ bullets, description, icon: Icon, lead, title }) => (
              <article
                className={cn(
                  "relative overflow-hidden rounded-xl border border-white/10 bg-neutral-950/78 p-7 sm:p-8",
                  "lg:col-span-4"
                )}
                key={title}
              >
                {lead ? (
                  <div
                    aria-hidden
                    className="absolute right-[-8rem] bottom-[-9rem] size-72 rounded-full border border-primary/16 shadow-[0_0_80px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
                  />
                ) : null}
                <div className="relative">
                  <Icon
                    aria-hidden
                    className="size-6 text-cleo-cyan"
                    stroke={1.5}
                  />
                  <h3 className="mt-7 max-w-xl font-heading text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                    {title}
                  </h3>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                    {description}
                  </p>
                  <ul className="mt-7 space-y-3">
                    {bullets.map((bullet) => (
                      <li
                        className="flex items-start gap-3 text-sm leading-6 text-foreground/82 sm:text-base"
                        key={bullet}
                      >
                        <IconCheck
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-cleo-cyan"
                          stroke={1.8}
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )
          )}
        </div>
      </div>
    </section>
  )
}

function PlatformEcosystem() {
  return (
    <section
      className="relative scroll-mt-20 overflow-hidden border-y border-white/10 bg-neutral-950/58"
      id="platforms"
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20 lg:px-10 lg:py-32">
        <div className="max-w-2xl">
          <h2 className="font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            Start with Discord. Connect more when you need to.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Discord is where you set up Cleo and manage your server. Twitch and
            Kick link the creator accounts used by their related bot tools.
          </p>
        </div>

        <div>
          <div className="space-y-3 sm:hidden">
            <div className="relative mx-auto mb-6 size-40 overflow-hidden rounded-full border border-white/14 bg-neutral-950 shadow-[0_0_60px_color-mix(in_oklab,var(--primary)_12%,transparent)]">
              <Image
                alt="Cleo"
                className="size-full object-cover"
                height={160}
                loading="eager"
                src="/android-chrome-512x512.png"
                unoptimized
                width={160}
              />
            </div>
            <PlatformCard
              description="The main dashboard for server configuration, moderation, support, welcome, and logs."
              icon={IconBrandDiscord}
              label="Start here"
              name="Discord"
              tone="cyan"
            />
            <PlatformCard
              description="Connect your Twitch account to Cleo's Twitch bot and related tools."
              icon={IconBrandTwitch}
              label="Linked creator account"
              name="Twitch"
              tone="indigo"
            />
            <PlatformCard
              description="Connect your Kick account to Cleo's Kick bot and related tools."
              icon={IconBrandKick}
              label="Linked creator account"
              name="Kick"
              tone="emerald"
            />
          </div>

          <div className="relative hidden min-h-[31rem] sm:block">
            <div
              aria-hidden
              className="absolute top-1/2 left-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_68%)] blur-xl"
            />
            <div className="absolute top-1/2 left-1/2 z-0 size-60 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border border-white/14 bg-neutral-950 shadow-[0_0_70px_color-mix(in_oklab,var(--primary)_12%,transparent)]">
              <Image
                alt="Cleo"
                className="size-full object-cover"
                height={240}
                sizes="15rem"
                src="/android-chrome-512x512.png"
                width={240}
              />
            </div>

            <PlatformCard
              className="absolute inset-x-0 right-auto bottom-0 z-10 w-[58%]"
              description="The main dashboard for server configuration, moderation, support, welcome, and logs."
              icon={IconBrandDiscord}
              label="Start here"
              name="Discord"
              tone="cyan"
            />
            <PlatformCard
              className="absolute top-0 right-0 z-10 w-[48%]"
              description="Connect your Twitch account to Cleo's Twitch bot and related tools."
              icon={IconBrandTwitch}
              label="Linked creator account"
              name="Twitch"
              tone="indigo"
            />
            <PlatformCard
              className="absolute right-0 bottom-4 z-10 w-[42%]"
              description="Connect your Kick account to Cleo's Kick bot and related tools."
              icon={IconBrandKick}
              label="Linked creator account"
              name="Kick"
              tone="emerald"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function PlatformCard({
  className,
  description,
  icon: Icon,
  label,
  name,
  tone,
}: {
  className?: string
  description: string
  icon: typeof IconBrandDiscord
  label: string
  name: string
  tone: "cyan" | "emerald" | "indigo"
}) {
  return (
    <article
      className={cn(
        "border border-white/12 bg-neutral-950/96 p-5 shadow-xl shadow-black/30 backdrop-blur-sm sm:p-6",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <Icon
          aria-hidden
          className={cn(
            "mt-0.5 size-7 shrink-0",
            tone === "cyan" && "text-cleo-cyan",
            tone === "indigo" && "text-cleo-indigo",
            tone === "emerald" && "text-emerald-400"
          )}
        />
        <div>
          <h3 className="font-heading text-xl font-semibold">{name}</h3>
          <p className="mt-1 text-sm text-foreground/72">{label}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>
      </div>
    </article>
  )
}

const TRUST_ITEMS = [
  {
    icon: IconBrandDiscord,
    title: "Sign in with Discord",
    description:
      "Your Discord account is the primary identity Cleo uses for dashboard access.",
  },
  {
    icon: IconEye,
    title: "Verified server access",
    description:
      "Server data is limited to owners and people with verified management access.",
  },
  {
    icon: IconHeartHandshake,
    title: "Decisions stay with people",
    description:
      "Configuration and moderation outcomes remain visible to the people responsible.",
  },
] as const

function TrustAndControl() {
  return (
    <section className="relative scroll-mt-20" id="safety">
      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
        <h2 className="font-heading text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
          You can see who can do what.
        </h2>
        <div className="mt-10 grid border-y border-white/10 md:grid-cols-3 md:divide-x md:divide-white/10">
          {TRUST_ITEMS.map(({ description, icon: Icon, title }) => (
            <article
              className="border-b border-white/10 py-7 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0"
              key={title}
            >
              <Icon
                aria-hidden
                className="size-6 text-cleo-cyan"
                stroke={1.5}
              />
              <h3 className="mt-5 font-heading text-xl font-semibold">
                {title}
              </h3>
              <p className="mt-3 text-base leading-7 text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function CleoPersonality() {
  return (
    <aside className="mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
      <div className="flex items-center gap-5 border-t border-white/10 pt-8 sm:gap-7">
        <Image
          alt=""
          className="size-16 shrink-0 rounded-full border border-white/12 object-cover sm:size-20"
          height={80}
          loading="eager"
          src="/android-chrome-192x192.png"
          unoptimized
          width={80}
        />
        <p className="max-w-2xl font-heading text-xl leading-7 font-medium tracking-[-0.02em] text-foreground/90 sm:text-2xl sm:leading-8">
          Cleo handles the repeatable parts, so your team has more time for
          people.
        </p>
      </div>
    </aside>
  )
}

function FinalCallToAction() {
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-neutral-950/70">
      <div
        aria-hidden
        className="absolute top-1/2 right-[-10rem] size-80 -translate-y-1/2 rounded-full border border-primary/18 shadow-[0_0_90px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
      />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-7 px-5 py-20 sm:px-8 sm:py-24 lg:flex-row lg:items-end lg:justify-between lg:px-10">
        <div>
          <h2 className="font-heading text-4xl leading-none font-semibold tracking-[-0.035em] sm:text-6xl">
            Want Cleo in your server?
          </h2>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
            Sign in with Discord and set up the features your community needs.
          </p>
        </div>
        <LandingAuthActions placement="hero" />
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 text-sm text-muted-foreground sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
      <p>Cleo by JCoNet LTD</p>
      <nav
        aria-label="Footer navigation"
        className="flex flex-wrap gap-x-5 gap-y-3"
      >
        <a className={footerLinkClassName} href="#product">
          Product
        </a>
        <a className={footerLinkClassName} href="#features">
          Features
        </a>
        <a className={footerLinkClassName} href="#platforms">
          Platforms
        </a>
        <a className={footerLinkClassName} href="#safety">
          Safety
        </a>
        <LandingAuthActions placement="footer" />
      </nav>
    </footer>
  )
}

const footerLinkClassName =
  "rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
