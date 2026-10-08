import assert from "node:assert/strict"
import { test } from "node:test"
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { WELCOME_FONT_SUBSETS } from "@workspace/shared/welcomeCard"

test("fresh startup prepares complete assets and input failures preserve previous output", async () => {
  const root = fileURLToPath(new URL("../../../../", import.meta.url))
  const fixture = await mkdtemp(path.join(tmpdir(), "cleo-welcome-assets-"))
  const sourceFonts = path.dirname(
    createRequire(import.meta.url).resolve("@fontsource/geist/package.json")
  )
  const output = path.join(
    fixture,
    "apps/discord-bot/src/services/welcome-assets"
  )
  const fixtureFonts = path.join(fixture, "node_modules/@fontsource/geist")
  try {
    await mkdir(path.join(fixture, "scripts/assets"), { recursive: true })
    await mkdir(path.join(fixtureFonts, "files"), { recursive: true })
    await cp(
      path.join(root, "scripts/prepare-welcome-assets.mjs"),
      path.join(fixture, "scripts/prepare-welcome-assets.mjs")
    )
    for (const name of [
      "twemoji-17.0.3.json.gz",
      "TWEMOJI-LICENSE-GRAPHICS",
      "welcome-render-golden.json",
    ])
      await cp(
        path.join(root, "scripts/assets", name),
        path.join(fixture, "scripts/assets", name)
      )
    await cp(
      path.join(root, "scripts/welcome-emoji-notice.txt"),
      path.join(fixture, "scripts/welcome-emoji-notice.txt")
    )
    for (const name of ["package.json", "LICENSE"])
      await cp(path.join(sourceFonts, name), path.join(fixtureFonts, name))
    for (const subset of WELCOME_FONT_SUBSETS)
      for (const weight of [400, 600, 700, 800]) {
        const name = `geist-${subset}-${weight}-normal.woff`
        await cp(
          path.join(sourceFonts, "files", name),
          path.join(fixtureFonts, "files", name)
        )
      }
    const run = () =>
      spawnSync(
        process.execPath,
        [path.join(fixture, "scripts/prepare-welcome-assets.mjs"), "bot"],
        { encoding: "utf8" }
      )
    const fresh = run()
    assert.equal(fresh.status, 0, fresh.stderr)
    const manifest = await readFile(path.join(output, "manifest.json"), "utf8")
    for (const subset of WELCOME_FONT_SUBSETS)
      assert.match(manifest, new RegExp(`geist-${subset}-800-normal.woff`))
    assert.ok((await readdir(path.join(output, "emoji"))).length > 4000)
    await writeFile(
      path.join(output, "previous-output-marker"),
      "last usable assets"
    )
    const missingFont = "geist-cyrillic-ext-800-normal.woff"
    await rm(path.join(fixtureFonts, "files", missingFont))
    assert.notEqual(run().status, 0)
    assert.equal(
      await readFile(path.join(output, "manifest.json"), "utf8"),
      manifest
    )
    assert.equal(
      await readFile(path.join(output, "previous-output-marker"), "utf8"),
      "last usable assets"
    )
    await cp(
      path.join(sourceFonts, "files", missingFont),
      path.join(fixtureFonts, "files", missingFont)
    )
    await rm(path.join(fixture, "scripts/welcome-emoji-notice.txt"))
    assert.notEqual(run().status, 0)
    assert.equal(
      await readFile(path.join(output, "manifest.json"), "utf8"),
      manifest
    )
    await cp(
      path.join(root, "scripts/welcome-emoji-notice.txt"),
      path.join(fixture, "scripts/welcome-emoji-notice.txt")
    )
    const replacement = run()
    assert.equal(replacement.status, 0, replacement.stderr)
    assert.equal(
      await readFile(path.join(output, "manifest.json"), "utf8"),
      manifest
    )
    assert.deepEqual(await readdir(path.dirname(output)), ["welcome-assets"])
    const licence = await readFile(path.join(output, "EMOJI-LICENSE"), "utf8")
    assert.ok(licence.includes("More considerations"))
    assert.ok(!licence.includes("More_considerations"))
    for (const surface of ["discord-bot", "dashboard"]) {
      const packageJson = JSON.parse(
        await readFile(path.join(root, "apps", surface, "package.json"), "utf8")
      )
      for (const script of ["dev", "start"])
        assert.match(packageJson.scripts[script], /^bun run assets:welcome && /)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
