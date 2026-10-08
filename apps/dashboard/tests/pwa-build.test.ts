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
    const manifests = html.match(/<link\b[^>]*rel="manifest"[^>]*>/g) ?? []
    assert.equal(manifests.length, 1, page)
    assert.match(manifests[0] ?? "", /href="\/site\.webmanifest"/)
    assert.match(html, /<meta name="mobile-web-app-capable" content="yes"/)
    assert.match(
      html,
      /<meta name="apple-mobile-web-app-capable" content="yes"/
    )
    assert.match(
      html,
      /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/
    )
  }
})
