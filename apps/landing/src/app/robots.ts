import type { MetadataRoute } from "next"
import { landingEnv } from "@workspace/env/landing"
import { siteOrigin } from "@/lib/siteMetadata"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(landingEnv.VERCEL_ENV === "preview"
        ? { disallow: "/" }
        : { allow: "/" }),
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  }
}
