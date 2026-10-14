import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { runInNewContext } from "node:vm"

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

test("built theme bootstrap is managed by Next and preserves stored and system preferences", async () => {
  const html = await readFile(
    new URL("../.next/server/app/sso-callback.html", import.meta.url),
    "utf8"
  )
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  const bootstrap = scripts.filter((script) =>
    script[1]?.includes('"cleo-theme"')
  )
  assert.equal(bootstrap.length, 1)
  const queue: {
    self: { __next_s: [number, { id: string; children: string }][] }
  } = {
    self: { __next_s: [] },
  }
  runInNewContext(bootstrap[0]?.[1] ?? "", queue)
  assert.equal(queue.self.__next_s.length, 1)
  const entry = queue.self.__next_s[0]
  assert.ok(entry)
  assert.equal(entry[0], 0, "Theme must run inline before hydration")
  assert.equal(entry[1].id, "cleo-theme")
  for (const [stored, systemDark, expectedDark] of [
    ["dark", false, true],
    ["light", true, false],
    [null, true, true],
    ["system", false, false],
  ] as const) {
    let dark = false
    const style = { colorScheme: "", backgroundColor: "" }
    runInNewContext(entry[1].children, {
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: systemDark }),
      document: {
        documentElement: {
          classList: {
            toggle: (name: string, enabled: boolean) => {
              assert.equal(name, "dark")
              dark = enabled
            },
          },
          style,
        },
      },
    })
    assert.equal(dark, expectedDark)
    assert.equal(style.colorScheme, expectedDark ? "dark" : "light")
    assert.equal(style.backgroundColor, expectedDark ? "#0a0a0b" : "#ffffff")
  }
  assert.doesNotThrow(() =>
    runInNewContext(entry[1].children, {
      localStorage: {
        getItem: () => {
          throw new Error("Storage blocked")
        },
      },
    })
  )
})
