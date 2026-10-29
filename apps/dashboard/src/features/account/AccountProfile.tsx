"use client"

import { UserProfile } from "@clerk/nextjs"

/** Clerk owns credentials, verification, session controls and security subroutes. */
export function AccountProfile() {
  return (
    <section
      className="mx-auto w-full max-w-4xl"
      aria-label="Profile and security"
    >
      <UserProfile
        routing="path"
        path="/account"
        appearance={{
          elements: {
            rootBox: "w-full max-w-none",
            cardBox: "w-full shadow-none",
            card: "w-full bg-transparent shadow-none",
            navbar: "hidden",
            pageScrollBox: "p-0",
            page: "p-0",
            profileSection__connectedAccounts: "hidden",
          },
        }}
      />
    </section>
  )
}
