import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

test("generated production HTML discovers the dashboard manifest on static app pages", async () => {
  // Build artifacts exercise Next's metadata rendering, without Clerk fixtures
  // pretending to authenticate a user or a mocked metadata renderer.
  for (const page of ["sso-callback", "_not-found"]) {
    const html = await readFile(
      new URL(`../.next/server/app/${page}.html`, import.meta.url),
      "utf8"
    )
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/)?.[1]
    assert.ok(
      head,
      `${page}: installation metadata must be in the initial head`
    )
    const manifests = head.match(/<link\b[^>]*rel="manifest"[^>]*>/g) ?? []
    assert.equal(manifests.length, 1, page)
    assert.equal(
      html.match(/<link\b[^>]*rel="manifest"[^>]*>/g)?.length,
      1,
      page
    )
    const manifestLink = manifests[0] ?? ""
    const href = manifestLink.match(/href="([^"]+)"/)?.[1]
    const pageUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1]
    assert.ok(href && pageUrl, page)
    assert.equal(new URL(href).href, new URL("/site.webmanifest", pageUrl).href)
    assert.doesNotMatch(manifestLink, /\bcrossorigin=/i)
    assert.match(html, /<meta name="mobile-web-app-capable" content="yes"/)
    assert.doesNotMatch(html, /<meta name="apple-mobile-web-app-capable"/)
    assert.match(
      html,
      /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/
    )
  }
})
