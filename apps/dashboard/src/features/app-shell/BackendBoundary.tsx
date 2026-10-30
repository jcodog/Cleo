"use client"

import { Component, type ReactNode } from "react"
import { dashboardEnv } from "@workspace/env/dashboard"
import { Button } from "@workspace/ui/components/button"

export function backendFailureMessage(error: Error): string {
  if (/Could not find public function/.test(error.message))
    return "The connected Convex deployment is missing this feature. Publish the matching backend revision to the deployment selected by NEXT_PUBLIC_CONVEX_URL, then retry."
  if (
    /Unauthenticated|not authenticated|signed in|OIDC|token.*expired/i.test(
      error.message
    )
  )
    return "Your Convex session could not be verified. Sign in again and check that Clerk and the connected Convex deployment use the same issuer."
  return "The backend request failed. Retry, or contact Cleo support with the connected deployment below."
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
    const deployment = dashboardEnv.NEXT_PUBLIC_CONVEX_URL
    return (
      <section className="space-y-4 py-4">
        <h2 className="font-heading text-xl font-medium">
          {this.props.feature} could not load
        </h2>
        <p role="alert" className="text-sm leading-6">
          {backendFailureMessage(this.state.error)}
        </p>
        <p className="text-xs break-words text-muted-foreground">
          Connected backend:{" "}
          {deployment
            ? new URL(deployment).hostname
            : "NEXT_PUBLIC_CONVEX_URL is missing"}
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
