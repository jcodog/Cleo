"use client"

import type { JSX } from "react"
import { IconArrowRight } from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"

type LandingAuthActionsProps = {
  placement: "footer" | "navigation" | "hero"
  origin: string
}

export function LandingAuthActions({
  placement,
  origin,
}: LandingAuthActionsProps): JSX.Element {
  if (placement === "footer") {
    return (
      <Link
        className="rounded-sm transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        href={`${origin}/sign-in`}
      >
        Sign in
      </Link>
    )
  }

  if (placement === "navigation") {
    return (
      <>
        <Link
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          href={`${origin}/sign-in`}
        >
          Sign in
        </Link>
        <Link
          className={buttonVariants({ size: "sm" })}
          href={`${origin}/sign-up`}
        >
          Get started
        </Link>
      </>
    )
  }

  return (
    <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
      <Link
        className={cn(
          buttonVariants({ size: "lg" }),
          "h-11 min-w-0 flex-1 justify-center px-3 sm:min-w-44 sm:flex-none sm:px-4"
        )}
        href={`${origin}/sign-up`}
      >
        Get started
        <IconArrowRight aria-hidden data-icon="inline-end" />
      </Link>
      <Link
        className={cn(
          buttonVariants({ variant: "ghost", size: "lg" }),
          "h-11 shrink-0 justify-center px-3 sm:min-w-28 sm:px-4"
        )}
        href={`${origin}/sign-in`}
      >
        Sign in
      </Link>
    </div>
  )
}
