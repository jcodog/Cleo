import type { Metadata } from "next"
import { landingEnv } from "@workspace/env/landing"
import { resolveWebOrigin } from "@workspace/env/origins"

export function siteOrigin(): string {
  return resolveWebOrigin({
    configuredUrl: landingEnv.NEXT_PUBLIC_SITE_URL,
    vercelUrl: landingEnv.VERCEL_URL,
    vercelEnv: landingEnv.VERCEL_ENV,
    variableName: "NEXT_PUBLIC_SITE_URL",
    localOrigin: "http://localhost:3001",
  })
}

export function appOrigin(): string {
  return resolveWebOrigin({
    configuredUrl: landingEnv.NEXT_PUBLIC_APP_URL,
    vercelUrl: landingEnv.VERCEL_URL,
    vercelEnv: landingEnv.VERCEL_ENV,
    allowVercelUrl: false,
    variableName: "NEXT_PUBLIC_APP_URL",
    localOrigin:
      landingEnv.NODE_ENV === "development"
        ? "https://localhost:3000"
        : "http://localhost:3000",
  })
}

export function siteMetadata(): Metadata {
  const description =
    "Manage your Discord server with Cleo's moderation, welcome, logs, support, automation, and AI-assisted tools."
  return {
    metadataBase: new URL(siteOrigin()),
    title: {
      default: "Cleo | Manage your Discord community",
      template: "%s | Cleo",
    },
    description,
    applicationName: "Cleo",
    authors: [{ name: "JCoNet LTD" }],
    creator: "JCoNet LTD",
    publisher: "JCoNet LTD",
    category: "technology",
    referrer: "origin-when-cross-origin",
    formatDetection: { address: false, email: false, telephone: false },
    icons: {
      icon: [
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    openGraph: {
      type: "website",
      siteName: "Cleo",
      title: "Cleo | Manage your Discord community",
      description,
      url: "/",
      images: [
        {
          url: "/android-chrome-512x512.png",
          width: 512,
          height: 512,
          alt: "Cleo, the community assistant",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: "Cleo | Manage your Discord community",
      description,
      images: ["/android-chrome-512x512.png"],
    },
    robots: {
      index: landingEnv.VERCEL_ENV !== "preview",
      follow: landingEnv.VERCEL_ENV !== "preview",
    },
    appleWebApp: {
      capable: true,
      title: "Cleo",
      statusBarStyle: "black-translucent",
    },
  }
}
