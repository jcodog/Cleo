"use client"

import { UserProfile, useAuth } from "@clerk/nextjs"
import { IconCreditCard, IconPlug } from "@tabler/icons-react"
import { AccountConnections } from "./AccountConnections"
import { PersonalBilling } from "./PersonalBilling"
import { BackendBoundary } from "@/features/app-shell/BackendBoundary"

/** Clerk owns credentials, verification, session controls and security subroutes. */
export function AccountProfile() {
  const { userId, sessionId } = useAuth()
  return (
    <section className="mx-auto w-full max-w-6xl" aria-label="Account settings">
      <UserProfile
        routing="path"
        path="/account"
        appearance={{
          elements: {
            rootBox: "w-full max-w-none",
            cardBox: "w-full shadow-none",
            card: "w-full bg-transparent shadow-none",
          },
        }}
      >
        <UserProfile.Page label="account" />
        <UserProfile.Page label="security" />
        <UserProfile.Page
          label="Connected accounts"
          url="connections"
          labelIcon={<IconPlug aria-hidden size={16} />}
        >
          <BackendBoundary
            key={`${userId}:${sessionId}:connections`}
            feature="Connections"
          >
            <AccountConnections />
          </BackendBoundary>
        </UserProfile.Page>
        <UserProfile.Page
          label="Billing & subscriptions"
          url="billing"
          labelIcon={<IconCreditCard aria-hidden size={16} />}
        >
          <BackendBoundary
            key={`${userId}:${sessionId}:billing`}
            feature="Billing"
          >
            <PersonalBilling />
          </BackendBoundary>
        </UserProfile.Page>
      </UserProfile>
    </section>
  )
}
