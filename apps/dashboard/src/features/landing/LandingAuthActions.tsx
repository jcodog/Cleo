"use client"

import type { JSX } from "react"
import { useAuth } from "@clerk/nextjs"
import { IconArrowRight } from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"

type LandingAuthActionsProps = {
  placement: "footer" | "navigation" | "hero"
}

export function LandingAuthActions({
  placement,
}: LandingAuthActionsProps): JSX.Element {
  const { isLoaded, isSignedIn } = useAuth()

  if (placement === "footer") {
    if (!isLoaded) {
      return (
        <span
          aria-hidden
          className="h-5 w-14 animate-pulse rounded-sm bg-white/6 motion-reduce:animate-none"
        />
      )
    }

    return (
      <Link
        className="rounded-sm transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        href={isSignedIn ? "/dashboard" : "/sign-in"}
      >
        {isSignedIn ? "Open dashboard" : "Sign in"}
      </Link>
    )
  }

  if (placement === "navigation") {
    if (!isLoaded) {
      return (
        <span
          aria-hidden
          className="h-8 w-40 animate-pulse rounded-md bg-white/6 motion-reduce:animate-none"
        />
      )
    }

    if (isSignedIn) {
      return (
        <Link className={buttonVariants({ size: "sm" })} href="/dashboard">
          Open dashboard
        </Link>
      )
    }

    return (
      <>
        <Link
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          href="/sign-in"
        >
          Sign in
        </Link>
        <Link className={buttonVariants({ size: "sm" })} href="/sign-up">
          Get started
        </Link>
      </>
    )
  }

  if (!isLoaded) {
    return (
      <div
        aria-hidden
        className="h-11 w-full max-w-sm animate-pulse rounded-md bg-white/6 motion-reduce:animate-none"
      />
    )
  }

  if (isSignedIn) {
    return (
      <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
        <Link
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-11 min-w-0 flex-1 justify-center px-3 sm:min-w-44 sm:flex-none sm:px-4"
          )}
          href="/dashboard"
        >
          Open dashboard
          <IconArrowRight aria-hidden data-icon="inline-end" />
        </Link>
        <a
          className={cn(
            buttonVariants({ variant: "ghost", size: "lg" }),
            "h-11 shrink-0 justify-center px-3 sm:min-w-32 sm:px-4"
          )}
          href="#product"
        >
          Explore product
        </a>
      </div>
    )
  }

  return (
    <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
      <Link
        className={cn(
          buttonVariants({ size: "lg" }),
          "h-11 min-w-0 flex-1 justify-center px-3 sm:min-w-44 sm:flex-none sm:px-4"
        )}
        href="/sign-up"
      >
        Get started
        <IconArrowRight aria-hidden data-icon="inline-end" />
      </Link>
      <Link
        className={cn(
          buttonVariants({ variant: "ghost", size: "lg" }),
          "h-11 shrink-0 justify-center px-3 sm:min-w-28 sm:px-4"
        )}
        href="/sign-in"
      >
        Sign in
      </Link>
    </div>
  )
}
