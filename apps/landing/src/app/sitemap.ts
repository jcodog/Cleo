import type { MetadataRoute } from "next"
import { siteOrigin } from "@/lib/siteMetadata"

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteOrigin() }]
}
