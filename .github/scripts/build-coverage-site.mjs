import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  validateCoverageHtml,
  validateCoverageXml,
} from "./validate-coverage-reports.mjs"

const reports = [
  { name: "Dashboard", path: "apps/dashboard" },
  { name: "Mobile", path: "apps/mobile" },
  { name: "Landing", path: "apps/landing" },
  { name: "Discord bot", path: "apps/discord-bot" },
  { name: "Twitch bot", path: "apps/twitch-bot" },
  { name: "Convex backend", path: "packages/backend" },
  { name: "Environment", path: "packages/env" },
  { name: "Logger", path: "packages/logger" },
  { name: "Shared", path: "packages/shared" },
  { name: "UI", path: "packages/ui" },
].filter(
  (report) =>
    !process.argv.includes("--production") || report.path !== "apps/mobile"
)

const sourceRoot = path.resolve("coverage")
const outputRoot = path.resolve("coverage-site")

// Validate every report before replacing the previous site. Incomplete,
// malformed, empty or non-file inputs must not destroy valid published output.
const invalid = []
for (const report of reports) {
  for (const file of ["cobertura-coverage.xml", "index.html"]) {
    const location = path.join(sourceRoot, report.path, file)
    const info = await stat(location).catch(() => null)
    if (!info?.isFile() || info.size === 0) {
      invalid.push(`${location}: missing or empty`)
      continue
    }
    try {
      const contents = await readFile(location, "utf8")
      if (file === "index.html") validateCoverageHtml(contents)
      else validateCoverageXml(contents)
    } catch (error) {
      invalid.push(
        `${location}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
if (invalid.length > 0)
  throw new Error(
    `Missing, empty or invalid coverage reports:\n${invalid.join("\n")}`
  )

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

for (const report of reports) {
  await cp(
    path.join(sourceRoot, report.path),
    path.join(outputRoot, report.path),
    {
      recursive: true,
    }
  )
}

const repository = process.env.GITHUB_REPOSITORY ?? "jcodog/Cleo"
const sha = process.env.COVERAGE_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "local"
const shortSha = sha.slice(0, 12)
const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null

const reportLinks = reports
  .map(
    (report) => `
      <a class="report" href="./${report.path}/index.html">
        <strong>${report.name}</strong>
        <span>${report.path}</span>
      </a>`
  )
  .join("")

const sourceLink = runUrl
  ? `<a href="${runUrl}">Workflow run</a>`
  : `<span>Local coverage build</span>`
const policyUrl = `https://github.com/${repository}/blob/main/.github/coverage-baseline.md`

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cleo coverage</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #080b0d;
        color: #f4f7f8;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; }
      main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 72px 0; }
      header { margin-bottom: 32px; }
      h1 { margin: 0 0 10px; font-size: clamp(2rem, 6vw, 3.5rem); letter-spacing: -0.04em; }
      p { margin: 0; color: #9aa8ad; line-height: 1.6; }
      .meta { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 18px; font-size: 0.9rem; }
      .meta a, .meta span { color: #9aa8ad; }
      .meta a:hover { color: #33fede; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
      .report {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 112px;
        padding: 20px;
        border: 1px solid #253138;
        border-radius: 14px;
        background: #0d1215;
        color: inherit;
        text-decoration: none;
        transition: border-color 120ms ease, transform 120ms ease;
      }
      .report:hover { border-color: #33fede; transform: translateY(-1px); }
      .report strong { font-size: 1.05rem; }
      .report span { color: #839198; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Cleo coverage</h1>
        <p>Latest successful scoped regression coverage from <code>main</code>.</p>
        <div class="meta">
          <span>Commit ${shortSha}</span>
          ${sourceLink}
          <a href="${policyUrl}">Scoped coverage policy</a>
        </div>
      </header>
      <section class="grid" aria-label="Workspace coverage reports">
        ${reportLinks}
      </section>
    </main>
  </body>
</html>
`

await writeFile(path.join(outputRoot, "index.html"), html)
await writeFile(path.join(outputRoot, ".nojekyll"), "")

console.log(
  `Built coverage site for ${reports.length} workspaces at ${outputRoot}`
)
