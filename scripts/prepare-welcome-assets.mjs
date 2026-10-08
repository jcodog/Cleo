import { createHash } from "node:crypto"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { gunzipSync } from "node:zlib"

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL("../", import.meta.url))

export async function prepareWelcomeAssets(destination) {
  const output = path.resolve(destination)
  const allowed = [
    "apps/discord-bot/src/services/welcome-assets",
    "apps/discord-bot/dist/welcome-assets",
    "apps/dashboard/public/welcome-assets",
  ].map((name) => path.resolve(root, name))
  if (!allowed.includes(output))
    throw new Error("Unexpected welcome asset directory")
  const archive = await readFile(
    path.join(root, "scripts/assets/twemoji-17.0.3.json.gz")
  )
  if (
    createHash("sha256").update(archive).digest("hex") !==
    "b3ae727b5186c08a367433013830d19b889bcb45a07f87b0999f41faf3785a2c"
  )
    throw new Error("Twemoji source archive checksum mismatch")
  const artwork = JSON.parse(gunzipSync(archive).toString("utf8"))
  const fontRoot = path.dirname(
    require.resolve("@fontsource/geist/package.json")
  )
  const files = new Map()
  for (const [name, svg] of Object.entries(artwork)) {
    if (!/^[a-f0-9-]+\.svg$/.test(name) || typeof svg !== "string")
      throw new Error("Invalid bundled emoji")
    files.set(`emoji/${name}`, Buffer.from(svg))
  }
  // Qualified sequences share artwork even when VS-16 is omitted.
  for (const [name, svg] of Object.entries(artwork)) {
    const alias = `emoji/${name.replaceAll("-fe0f", "")}`
    if (!files.has(alias)) files.set(alias, Buffer.from(svg))
  }
  for (const subset of ["latin", "latin-ext", "cyrillic", "cyrillic-ext"]) {
    for (const weight of [400, 600, 700, 800]) {
      const name = `geist-${subset}-${weight}-normal.woff`
      files.set(
        `fonts/${name}`,
        await readFile(path.join(fontRoot, "files", name))
      )
    }
  }
  files.set("FONT-LICENSE", await readFile(path.join(fontRoot, "LICENSE")))
  files.set(
    "EMOJI-NOTICE.txt",
    await readFile(path.join(root, "scripts/welcome-emoji-notice.txt"))
  )
  files.set(
    "EMOJI-LICENSE",
    await readFile(path.join(root, "scripts/assets/TWEMOJI-LICENSE-GRAPHICS"))
  )
  files.set(
    "render-golden.json",
    await readFile(path.join(root, "scripts/assets/welcome-render-golden.json"))
  )
  // Load every input before touching the last usable output. Write a complete
  // sibling first; retain the old directory until replacement succeeds.
  await mkdir(path.dirname(output), { recursive: true })
  const staged = await mkdtemp(`${output}-staged-`)
  const backup = `${staged}-previous`
  let movedPrevious = false
  try {
    await mkdir(path.join(staged, "emoji"))
    await mkdir(path.join(staged, "fonts"))
    const hashes = {}
    for (const [name, source] of files) {
      await writeFile(path.join(staged, name), source)
      hashes[name] = createHash("sha256").update(source).digest("hex")
    }
    await writeFile(
      path.join(staged, "manifest.json"),
      JSON.stringify(hashes, null, 2) + "\n"
    )
    const exists = await access(output).then(
      () => true,
      (error) => {
        if (error.code === "ENOENT") return false
        throw error
      }
    )
    if (exists) {
      await rename(output, backup)
      movedPrevious = true
    }
    try {
      await rename(staged, output)
    } catch (error) {
      if (movedPrevious) await rename(backup, output)
      throw error
    }
    if (movedPrevious) await rm(backup, { recursive: true })
  } finally {
    await rm(staged, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const surface = process.argv[2]
  if (surface !== "bot" && surface !== "dashboard")
    throw new Error("Expected bot or dashboard")
  await prepareWelcomeAssets(
    path.join(
      root,
      surface === "bot"
        ? "apps/discord-bot/src/services/welcome-assets"
        : "apps/dashboard/public/welcome-assets"
    )
  )
}
