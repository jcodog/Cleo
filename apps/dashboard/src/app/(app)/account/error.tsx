"use client"

import { Button } from "@workspace/ui/components/button"

export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-4xl space-y-4 py-6">
      <h1 className="font-heading text-2xl font-medium">Account unavailable</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        Your account details could not be loaded. Check your connection and
        retry.
      </p>
      <Button variant="outline" onClick={reset}>
        Retry account
      </Button>
    </section>
  )
}
