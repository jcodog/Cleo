import assert from "node:assert/strict"
import { test } from "node:test"

// Run against a production build, not mocked metadata or a development server.
// This test runs directly, outside Turbo caching, against the caller's server.
// oxlint-disable-next-line turbo/no-undeclared-env-vars
const origin = process.env.PWA_TEST_ORIGIN
assert.ok(
  origin,
  "Set PWA_TEST_ORIGIN to the running dashboard production build"
)
const appUrl = new URL(origin)

const appPaths = [
  "/",
  "/sign-in",
  "/sign-up",
  "/onboarding",
  "/dashboard",
  "/dashboard/123/logs?tab=logs",
  "/twitch?tab=chat",
  "/kick",
  "/staff",
  "/account",
  "/settings",
  "/billing",
  "/subscription",
]

async function get(path: string, redirect: RequestRedirect = "follow") {
  return fetch(new URL(path, appUrl), {
    redirect,
    signal: AbortSignal.timeout(10_000),
  })
}

test("production HTML discovers one manifest and emits standard and Apple install metadata", async () => {
  for (const path of ["/", "/sign-in", "/sign-up", "/twitch?tab=chat"]) {
    const response = await get(path)
    assert.equal(response.status, 200, path)
    assert.equal(new URL(response.url).origin, appUrl.origin)
    const html = await response.text()
    const manifests = html.match(/<link\b[^>]*rel="manifest"[^>]*>/g) ?? []
    assert.equal(manifests.length, 1, path)
    assert.match(manifests[0] ?? "", /href="\/site\.webmanifest"/)
    assert.match(html, /<meta name="application-name" content="Cleo"/)
    assert.match(html, /<meta name="mobile-web-app-capable" content="yes"/)
    assert.match(
      html,
      /<meta name="apple-mobile-web-app-capable" content="yes"/
    )
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="Cleo"/)
    assert.match(
      html,
      /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/
    )
    assert.match(html, /<meta name="theme-color"/)
    assert.match(
      html,
      /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180"/
    )
  }
})

test("served manifest has a stable origin-local identity, launch URL and scope with usable install icons", async () => {
  const response = await get("/site.webmanifest", "manual")
  assert.equal(response.status, 200)
  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/manifest\+json\b/
  )
  const manifest: unknown = await response.json()
  assert.ok(manifest && typeof manifest === "object")
  for (const [key, expected] of Object.entries({
    id: "/",
    name: "Cleo",
    short_name: "Cleo",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#0a0a0a",
    background_color: "#0a0a0a",
  })) {
    assert.ok(key in manifest)
    assert.equal(Reflect.get(manifest, key), expected, key)
  }
  // Resolve like a browser, including installation from a protected deep link.
  const manifestUrl = new URL(response.url)
  const scope = new URL(Reflect.get(manifest, "scope"), manifestUrl)
  for (const base of [appUrl, new URL("/twitch?tab=chat", appUrl)]) {
    for (const key of ["id", "start_url", "scope"]) {
      const resolved = new URL(Reflect.get(manifest, key), base)
      assert.equal(resolved.origin, appUrl.origin)
      assert.equal(resolved.pathname, "/")
    }
  }
  for (const path of appPaths) {
    const url = new URL(path, appUrl)
    assert.equal(url.origin, scope.origin)
    assert.ok(url.pathname.startsWith(scope.pathname), path)
  }
  assert.ok("icons" in manifest && Array.isArray(manifest.icons))
  const sizes = new Set<string>()
  for (const icon of manifest.icons) {
    assert.ok(icon && typeof icon === "object")
    assert.equal(icon.type, "image/png")
    assert.equal(icon.purpose, "any")
    assert.equal(typeof icon.src, "string")
    const url = new URL(icon.src, manifestUrl)
    assert.equal(url.origin, appUrl.origin)
    const asset = await fetch(url, { redirect: "manual" })
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get("content-type") ?? "", /^image\/png/)
    const png = Buffer.from(await asset.arrayBuffer())
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
    const actualSize = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
    assert.equal(icon.sizes, actualSize, icon.src)
    sizes.add(actualSize)
  }
  assert.ok(sizes.has("192x192") && sizes.has("512x512"))
  const apple = await get("/apple-touch-icon.png", "manual")
  assert.equal(apple.status, 200)
  const png = Buffer.from(await apple.arrayBuffer())
  assert.equal(png.readUInt32BE(16), 180)
  assert.equal(png.readUInt32BE(20), 180)
})

test("signed-out root, old sign-out marker and protected deep links stay on the application origin", async () => {
  for (const path of [...appPaths, "/?s=sign-out"]) {
    const response = await get(path, "manual")
    if (path === "/sign-in" || path === "/sign-up") {
      assert.equal(response.status, 200, path)
      continue
    }
    assert.ok(
      [303, 307, 308].includes(response.status),
      `${path}: ${response.status}`
    )
    const location = response.headers.get("location")
    assert.ok(location, path)
    const destination = new URL(location, appUrl)
    assert.equal(destination.origin, appUrl.origin)
    assert.equal(destination.pathname, "/sign-in")
    if (path !== "/" && path !== "/?s=sign-out") {
      assert.equal(destination.searchParams.get("returnTo"), path)
    }
  }
})
