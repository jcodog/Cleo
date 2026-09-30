import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath, URL } from "node:url"
import {
  releaseFiles,
  validateArtifact,
} from "../src/deployment/validateArtifact.mjs"

const app = fileURLToPath(new URL("../", import.meta.url))
const repository = resolve(app, "../..")
const [output, sha] = process.argv.slice(2)
if (
  !output ||
  !/^[a-f0-9]{40}$/.test(sha ?? "") ||
  process.platform !== "linux" ||
  process.arch !== "x64" ||
  process.version !== "v24.15.0"
)
  throw new Error(
    "Packaging requires output directory, immutable SHA and Linux x64 Node v24.15.0."
  )
if (
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repository,
    encoding: "utf8",
  }).trim() !== sha
)
  throw new Error("Packaging SHA must identify the checked-out commit.")
const destination = resolve(output)
// Exclusive creation prevents mixing files from earlier builds or packages.
await mkdir(destination, { recursive: false })
const release = join(destination, sha)
await mkdir(release)
for (const file of releaseFiles) {
  await mkdir(dirname(join(release, file)), { recursive: true })
  if (file === "package.json")
    await writeFile(
      join(release, file),
      JSON.stringify({
        name: "@workspace/twitch-bot",
        version: "0.1.0",
        type: "module",
      })
    )
  else await copyFile(join(app, file), join(release, file))
}
const files = []
for (const path of releaseFiles) {
  const content = await readFile(join(release, path))
  files.push({
    path,
    size: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  })
}
await writeFile(
  join(release, "manifest.json"),
  JSON.stringify({
    contractVersion: 1,
    sha,
    service: "twitch-bot",
    platform: "linux-x64",
    nodeVersion: "v24.15.0",
    files,
  })
)
await validateArtifact(release, sha)
const archive = join(destination, `cleo-twitch-${sha}.tar.gz`)
execFileSync("tar", [
  "-czf",
  archive,
  "-C",
  release,
  "--",
  ...releaseFiles,
  "manifest.json",
])
await writeFile(
  `${archive}.sha256`,
  `${createHash("sha256")
    .update(await readFile(archive))
    .digest("hex")}  cleo-twitch-${sha}.tar.gz\n`
)
