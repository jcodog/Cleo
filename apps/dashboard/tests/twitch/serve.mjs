import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { build, Glob, serve } from "bun"

const root = process.cwd()
const bundle = await build({
  entrypoints: ["tests/twitch/fixture.tsx"],
  target: "browser",
  format: "iife",
  jsx: { runtime: "automatic" },
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "isolated-twitch-providers",
      setup(build) {
        build.onResolve({ filter: /^next\/image$/ }, () => ({
          path: path.join(root, "tests/twitch/image-fixture.tsx"),
        }))
        build.onResolve({ filter: /^\.\/routes$/ }, (args) => {
          if (args.importer.endsWith("AppPlatformSelector.tsx"))
            return {
              path: path.join(root, "tests/twitch/routes-release-fixture.ts"),
            }
        })
        build.onResolve({ filter: /^next\/(?:link|navigation)$/ }, () => ({
          path: path.join(root, "tests/twitch/navigation-fixture.tsx"),
        }))
        build.onResolve({ filter: /^@clerk\/nextjs$/ }, () => ({
          path: path.join(root, "tests/twitch/clerk-fixture.ts"),
        }))
      },
    },
  ],
})
if (!bundle.success) throw new Error(bundle.logs.join("\n"))
const javascript = await bundle.outputs[0].text()
const styles = await Array.fromAsync(
  new Glob("**/*.css").scan({ cwd: path.join(root, ".next/static") })
)
if (!styles.length)
  throw new Error("Build the dashboard before browser verification")
const css = (
  await Promise.all(
    styles.map((file) =>
      readFile(path.join(root, ".next/static", file), "utf8")
    )
  )
).join("\n")
serve({
  hostname: "127.0.0.1",
  port: 4319,
  fetch: async (request) => {
    const url = new URL(request.url)
    if (url.pathname === "/api/query") {
      const { path: queryPath } = await request.json()
      if (
        ![
          "queries/dashboard/discord/guilds/manageable:list",
          "queries/dashboard/staff/access:get",
        ].includes(queryPath)
      )
        return new Response("Unknown fixture query", { status: 400 })
      return Response.json({
        status: "success",
        value: queryPath.includes("manageable") ? [] : null,
      })
    }
    if (url.pathname === "/favicon-32x32.png")
      return new Response(
        await readFile(path.join(root, "public/favicon-32x32.png")),
        { headers: { "content-type": "image/png" } }
      )
    if (url.pathname === "/fixture.js")
      return new Response(javascript, {
        headers: { "content-type": "application/javascript" },
      })
    if (url.pathname === "/fixture.css")
      return new Response(css, { headers: { "content-type": "text/css" } })
    if (url.pathname === "/font.woff")
      return new Response(
        await readFile(
          path.join(
            root,
            "public/welcome-assets/fonts/geist-latin-400-normal.woff"
          )
        ),
        { headers: { "content-type": "font/woff" } }
      )
    const theme = url.searchParams.get("theme") === "light" ? "" : "dark"
    return new Response(
      `<!doctype html><html class="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>@font-face{font-family:Geist;src:url(/font.woff)}body{margin:0;background:var(--background);color:var(--foreground);font-family:Geist,sans-serif}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`,
      { headers: { "content-type": "text/html" } }
    )
  },
})
