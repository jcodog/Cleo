"use client"

import { Component, type ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"

export function backendFailureMessage(error: Error): string {
  if (/Could not find public function/.test(error.message))
    return "This feature is temporarily unavailable. Retry, or contact Cleo support."
  if (
    /Unauthenticated|not authenticated|signed in|OIDC|token.*expired/i.test(
      error.message
    )
  )
    return "Your account connection could not be verified. Sign in again, then retry."
  return "The request failed. Retry, or contact Cleo support."
}

/** Keep a failed application integration inside its page, preserving Clerk navigation. */
export class BackendBoundary extends Component<
  { children: ReactNode; feature: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="space-y-4 py-4">
        <h2 className="font-heading text-xl font-medium">
          {this.props.feature} could not load
        </h2>
        <p role="alert" className="text-sm leading-6">
          {backendFailureMessage(this.state.error)}
        </p>
        <Button
          variant="outline"
          onClick={() => this.setState({ error: null })}
        >
          Retry
        </Button>
      </section>
    )
  }
}
