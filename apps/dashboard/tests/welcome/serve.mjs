import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { build, Glob, serve } from "bun"

const root = process.cwd()
const bundle = await build({
  entrypoints: ["tests/welcome/fixture.tsx"],
  target: "browser",
  format: "iife",
  jsx: { runtime: "automatic" },
  define: {
    "process.env": JSON.stringify({ NODE_ENV: "development" }),
  },
})
if (!bundle.success)
  throw new Error(
    `Welcome browser fixture failed to compile: ${bundle.logs.join("\n")}`
  )
const javascript = await bundle.outputs[0].text()
const cssFiles = await Array.fromAsync(
  new Glob("**/*.css").scan({ cwd: path.join(root, ".next/static") })
)
if (!cssFiles.length)
  throw new Error("Build the dashboard before browser verification")
const css = (
  await Promise.all(
    cssFiles.map((name) =>
      readFile(path.join(root, ".next/static", name), "utf8")
    )
  )
).join("\n")
const html = `<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>@font-face{font-family:Geist;src:url(/welcome-assets/fonts/geist-latin-400-normal.woff)}body{background:#0a0a0b;color:#f5f5f5;font-family:Geist,sans-serif;margin:0;padding:40px;max-width:1280px;margin-inline:auto}@media(max-width:600px){body{padding:20px}}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`
serve({
  hostname: "127.0.0.1",
  port: 4318,
  async fetch(request) {
    const pathname = new URL(request.url).pathname
    if (pathname === "/")
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    if (pathname === "/fixture.js")
      return new Response(javascript, {
        headers: { "content-type": "application/javascript; charset=utf-8" },
      })
    if (pathname === "/fixture.css")
      return new Response(css, { headers: { "content-type": "text/css" } })
    if (
      !/^\/welcome-assets\/(?:emoji\/[a-f0-9-]+\.svg|fonts\/geist-[a-z-]+-\d+-normal\.woff)$/.test(
        pathname
      )
    )
      return new Response(null, { status: 404 })
    try {
      return new Response(await readFile(path.join(root, "public", pathname)), {
        headers: {
          "content-type": pathname.endsWith(".svg")
            ? "image/svg+xml"
            : "font/woff",
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  },
})
