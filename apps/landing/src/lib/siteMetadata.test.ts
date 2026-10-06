import assert from "node:assert/strict"
import { test } from "node:test"
import { NextRequest } from "next/server"

test("landing metadata, robots, sitemap and compatibility proxy use the separate configured origins", async (t) => {
  const values = {
    NEXT_PUBLIC_SITE_URL: "https://cleoai.cloud",
    NEXT_PUBLIC_APP_URL: "https://app.cleoai.cloud",
    VERCEL_URL: "",
    VERCEL_ENV: "production",
    NODE_ENV: "production",
  }
  t.mock.module("@workspace/env/landing", { exports: { landingEnv: values } })
  const { siteMetadata, siteOrigin, appOrigin } = await import("./siteMetadata")
  const { default: robots } = await import("../app/robots")
  const { default: sitemap } = await import("../app/sitemap")
  const { default: proxy } = await import("../proxy")
  assert.equal(siteOrigin(), "https://cleoai.cloud")
  assert.equal(appOrigin(), "https://app.cleoai.cloud")
  assert.equal(siteMetadata().metadataBase?.toString(), "https://cleoai.cloud/")
  assert.deepEqual(siteMetadata().robots, { index: true, follow: true })
  assert.deepEqual(sitemap(), [{ url: "https://cleoai.cloud" }])
  assert.equal(robots().sitemap, "https://cleoai.cloud/sitemap.xml")
  assert.deepEqual(robots().rules, { userAgent: "*", allow: "/" })
  const response = proxy(
    new NextRequest("https://cleoai.cloud/dashboard/123?tab=logs&tab=roles")
  )
  assert.equal(response.status, 308)
  assert.equal(
    response.headers.get("location"),
    "https://app.cleoai.cloud/dashboard/123?tab=logs&tab=roles"
  )
  assert.equal(
    proxy(new NextRequest("https://cleoai.cloud/pricing")).headers.get(
      "location"
    ),
    null
  )
  values.VERCEL_ENV = "preview"
  assert.equal(
    proxy(new NextRequest("https://site.vercel.app/")).headers.get(
      "X-Robots-Tag"
    ),
    "noindex, nofollow"
  )
  assert.deepEqual(siteMetadata().robots, { index: false, follow: false })
  assert.deepEqual(robots().rules, { userAgent: "*", allow: "/" })
  values.NEXT_PUBLIC_APP_URL = ""
  assert.throws(appOrigin, /NEXT_PUBLIC_APP_URL must be configured/)
  assert.throws(
    () => proxy(new NextRequest("https://site.vercel.app/twitch")),
    /NEXT_PUBLIC_APP_URL must be configured/
  )
  values.VERCEL_URL = "landing-preview.vercel.app"
  values.NEXT_PUBLIC_SITE_URL = ""
  assert.equal(siteOrigin(), "https://landing-preview.vercel.app")
  values.VERCEL_ENV = "production"
  assert.throws(siteOrigin, /NEXT_PUBLIC_SITE_URL must be configured/)
  values.VERCEL_ENV = ""
  values.VERCEL_URL = ""
  values.NODE_ENV = "development"
  assert.equal(appOrigin(), "https://localhost:3000")
  assert.equal(siteOrigin(), "http://localhost:3001")
  values.NODE_ENV = "production"
  assert.equal(appOrigin(), "http://localhost:3000")
})
