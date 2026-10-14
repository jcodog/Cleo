import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"

assert.equal(`${process.platform}-${process.arch}`, "linux-x64")
assert.equal(process.version, "v24.15.0")
const repository = fileURLToPath(new URL("../../", import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), "cleo-twitch-package-test-"))
const fixture = join(temporary, "repository")
const app = join(fixture, "apps/twitch-bot")
/** Run fixture-repository Git commands without changing the user's checkout. */
const git = (...args) =>
  execFileSync("git", ["-C", fixture, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
let sequence = 0

/** Assert GNU tar headers directly, without locale-sensitive listing output or extracting entries. */
function assertArchiveMetadata(compressed, timestamp) {
  const archive = gunzipSync(compressed)
  const names = []
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    assert.deepEqual(
      header.subarray(257, 265),
      Buffer.from("ustar  \0"),
      "GNU format"
    )
    const name = header.subarray(0, 100).toString("ascii").replace(/\0.*$/s, "")
    names.push(name)
    assert.equal(header[156], 48, `${name}: regular file`)
    assert.equal(
      header.subarray(157, 257).every((byte) => byte === 0),
      true,
      "No link target"
    )
    assert.equal(
      header.subarray(265, 329).every((byte) => byte === 0),
      true,
      "Numeric ownership without user/group names"
    )
    /** Read the non-negative octal fields used by these small deterministic release members. */
    const octal = (start, length) => {
      const value = header
        .subarray(start, start + length)
        .toString("ascii")
        .replace(/\0.*$/s, "")
        .trim()
      assert.match(value, /^[0-7]+$/)
      return Number.parseInt(value, 8)
    }
    assert.equal(octal(100, 8), 0o644, `${name}: normalized mode`)
    assert.equal(octal(108, 8), 0, `${name}: uid`)
    assert.equal(octal(116, 8), 0, `${name}: gid`)
    assert.equal(octal(136, 12), timestamp, `${name}: commit timestamp`)
    const checksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0
    )
    assert.equal(octal(148, 8), checksum, `${name}: header checksum`)
    const size = octal(124, 12)
    assert.ok(size > 0 && size <= 10 * 1024 * 1024, `${name}: bounded content`)
    offset += 512 + Math.ceil(size / 512) * 512
    assert.ok(offset <= archive.length, "Complete member content")
  }
  assert.deepEqual(names, [
    "dist/index.js",
    "dist/scripts/authorizeBot.js",
    "dist/scripts/checkReadiness.js",
    "dist/scripts/sendSmokeMessage.js",
    "manifest.json",
    "package.json",
    "runtime-artifact.json",
  ])
  assert.ok(archive.length - offset >= 1024, "Two tar end markers")
  assert.equal(
    archive.subarray(offset).every((byte) => byte === 0),
    true,
    "Only zero padding after members"
  )
}

try {
  await mkdir(join(app, "scripts"), { recursive: true })
  await mkdir(join(app, "src/deployment"), { recursive: true })
  for (const path of [
    "scripts/package-release.mjs",
    "src/deployment/validateArtifact.mjs",
    "runtime-artifact.json",
  ])
    await cp(join(repository, "apps/twitch-bot", path), join(app, path))
  await cp(join(repository, "apps/twitch-bot/dist"), join(app, "dist"), {
    recursive: true,
  })
  await writeFile(join(fixture, ".gitignore"), "dist\n")
  git("init", "--quiet")
  git("add", ".")
  git(
    "-c",
    "user.name=Artifact fixture",
    "-c",
    "user.email=fixture@example.test",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "Artifact fixture"
  )
  const sha = git("rev-parse", "HEAD")
  const timestamp = Number(git("show", "-s", "--format=%ct", sha))
  /** Package the isolated commit under a caller environment and require the expected exit/diagnostic. */
  const packageRelease = (expectedStatus = 0, diagnostic, environment = {}) => {
    const output = join(temporary, `output-${++sequence}`)
    const result = spawnSync(
      process.execPath,
      [join(app, "scripts/package-release.mjs"), output, sha],
      {
        cwd: fixture,
        env: { ...process.env, ...environment },
        encoding: "utf8",
        timeout: 10000,
      }
    )
    assert.ifError(result.error)
    assert.equal(result.status, expectedStatus, result.stderr)
    if (diagnostic) assert.match(result.stderr, diagnostic)
    return output
  }
  const first = packageRelease(0, undefined, { TZ: "UTC0", LC_ALL: "C" })
  const firstArchive = await readFile(join(first, `cleo-twitch-${sha}.tar.gz`))
  assertArchiveMetadata(firstArchive, timestamp)
  execFileSync(
    "sh",
    [
      "-c",
      'cd "$1" && sha256sum -c "$2"',
      "sh",
      first,
      `cleo-twitch-${sha}.tar.gz.sha256`,
    ],
    { stdio: "inherit" }
  )
  await utimes(join(app, "dist/index.js"), new Date(0), new Date(0))
  await new Promise((resolve) => setTimeout(resolve, 1100))
  // C and POSIX are always available; POSIX TZ strings require no installed locale or zone data.
  const second = packageRelease(0, undefined, {
    TZ: "EST5EDT",
    LC_ALL: "POSIX",
  })
  const secondArchive = await readFile(
    join(second, `cleo-twitch-${sha}.tar.gz`)
  )
  assertArchiveMetadata(secondArchive, timestamp)
  assert.deepEqual(firstArchive, secondArchive)
  const extracted = join(temporary, "extracted")
  await mkdir(extracted)
  execFileSync("tar", [
    "-xzf",
    join(second, `cleo-twitch-${sha}.tar.gz`),
    "-C",
    extracted,
  ])
  const { validateArtifact } = await import(
    new URL(
      "../../apps/twitch-bot/src/deployment/validateArtifact.mjs",
      import.meta.url
    )
  )
  await validateArtifact(extracted, sha)
  execFileSync(
    process.execPath,
    [
      join(repository, ".github/scripts/check-twitch-entrypoints.mjs"),
      extracted,
    ],
    { stdio: "inherit" }
  )
  const extractedEntry = join(extracted, "dist/index.js")
  const extractedContent = await readFile(extractedEntry)
  for (const [broken, evidence] of [
    [
      'await fetch("https://api.twitch.tv/helix/chat/messages")',
      /TWITCH_ARTIFACT_NETWORK_ATTEMPT/,
    ],
    ["const = broken", /SyntaxError/],
    ['import "test-only-missing-module"', /ERR_MODULE_NOT_FOUND/],
  ]) {
    await writeFile(extractedEntry, broken)
    const failed = spawnSync(
      process.execPath,
      [
        join(repository, ".github/scripts/check-twitch-entrypoints.mjs"),
        extracted,
      ],
      { encoding: "utf8", timeout: 10000 }
    )
    assert.ifError(failed.error)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, evidence)
  }
  await writeFile(extractedEntry, extractedContent)

  await writeFile(join(fixture, ".gitignore"), "dist\n# dirty source\n")
  packageRelease(1, /clean working tree/)
  git("checkout", "--", ".gitignore")
  await writeFile(join(app, "untracked-source.ts"), "export {}\n")
  packageRelease(1, /clean working tree/)
  await rm(join(app, "untracked-source.ts"))

  const entry = join(app, "dist/index.js")
  const content = await readFile(entry)
  await rm(entry)
  await symlink(join(app, "runtime-artifact.json"), entry)
  packageRelease(1, /without symlinks/)
  await rm(entry)
  await mkdir(entry)
  packageRelease(1, /regular files/)
  await rm(entry, { recursive: true })
  execFileSync("mkfifo", [entry])
  packageRelease(1, /regular files/)
  await rm(entry)
  await writeFile(entry, content)
  const dist = join(app, "dist")
  const outside = join(temporary, "outside-dist")
  await cp(dist, outside, { recursive: true })
  await rm(dist, { recursive: true })
  await symlink(outside, dist)
  packageRelease(1, /without symlinks/)
  console.log(
    "Twitch packaging rejects dirty/untracked sources, symlinks, directories, FIFO and escaping parents; GNU headers, ordered contents, ownership, modes and commit timestamps are verified; archive bytes survive mtime, locale and timezone changes."
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
