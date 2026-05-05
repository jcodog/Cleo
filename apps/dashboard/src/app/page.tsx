import Link from "next/link"
import { buttonVariants } from "@workspace/ui/components/button"

export default function Page() {
  return (
    <main className="flex min-h-svh items-center p-6">
      <div className="flex max-w-sm min-w-0 flex-col gap-4 text-sm">
        <h1 className="font-heading text-2xl font-medium">Cleo</h1>
        <p className="text-muted-foreground">
          Sign in to open the dashboard.
        </p>
        <div className="flex gap-2">
          <Link href="/sign-in" className={buttonVariants()}>
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={buttonVariants({ variant: "outline" })}
          >
            Sign up
          </Link>
        </div>
      </div>
    </main>
  )
}
