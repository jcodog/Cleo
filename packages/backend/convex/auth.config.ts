import { type AuthConfig } from "convex/server"

const clerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN

if (!clerkIssuerDomain) {
  throw new Error("Missing CLERK_JWT_ISSUER_DOMAIN")
}

const authConfig = {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig

export default authConfig
