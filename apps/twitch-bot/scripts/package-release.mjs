import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
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
if (
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repository,
    encoding: "utf8",
  }).trim()
)
  throw new Error(
    "Release packaging requires a clean working tree, including untracked sources."
  )
const timestamp = execFileSync("git", ["show", "-s", "--format=%ct", sha], {
  cwd: repository,
  encoding: "utf8",
}).trim()
if (!/^\d+$/.test(timestamp)) throw new Error("Invalid commit timestamp.")
const appRoot = await realpath(app)

async function sourceContent(file) {
  let source = app
  const parts = file.split("/")
  for (let i = 0; i < parts.length; i++) {
    source = join(source, parts[i])
    const stat = await lstat(source)
    if (
      stat.isSymbolicLink() ||
      (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())
    )
      throw new Error(
        "Release sources must be regular files under real directories, without symlinks."
      )
  }
  const resolved = await realpath(source)
  if (!resolved.startsWith(`${appRoot}${sep}`))
    throw new Error("Release source escapes the application.")
  const handle = await open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  try {
    const stat = await handle.stat()
    if (
      !stat.isFile() ||
      stat.size < 1 ||
      stat.size > 10 * 1024 * 1024 ||
      (await realpath(`/proc/self/fd/${handle.fd}`)) !== resolved
    )
      throw new Error("Invalid or changed release source.")
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}
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
  else
    await writeFile(join(release, file), await sourceContent(file), {
      mode: 0o644,
    })
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
execFileSync(
  "tar",
  [
    "-czf",
    archive,
    "-C",
    release,
    "--format=gnu",
    "--sort=name",
    `--mtime=@${timestamp}`,
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--mode=u=rw,go=r",
    "--",
    ...[...releaseFiles, "manifest.json"].sort(),
  ],
  { env: { ...process.env, TZ: "UTC", LC_ALL: "C" } }
)
await writeFile(
  `${archive}.sha256`,
  `${createHash("sha256")
    .update(await readFile(archive))
    .digest("hex")}  cleo-twitch-${sha}.tar.gz\n`
)
