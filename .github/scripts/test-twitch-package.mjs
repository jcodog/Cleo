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

assert.equal(`${process.platform}-${process.arch}`, "linux-x64")
assert.equal(process.version, "v24.15.0")
const repository = fileURLToPath(new URL("../../", import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), "cleo-twitch-package-test-"))
const fixture = join(temporary, "repository")
const app = join(fixture, "apps/twitch-bot")
const git = (...args) =>
  execFileSync("git", ["-C", fixture, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
let sequence = 0
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
  const packageRelease = (expectedStatus = 0, diagnostic) => {
    const output = join(temporary, `output-${++sequence}`)
    const result = spawnSync(
      process.execPath,
      [join(app, "scripts/package-release.mjs"), output, sha],
      { cwd: fixture, encoding: "utf8", timeout: 10000 }
    )
    assert.ifError(result.error)
    assert.equal(result.status, expectedStatus, result.stderr)
    if (diagnostic) assert.match(result.stderr, diagnostic)
    return output
  }
  const first = packageRelease()
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
  const second = packageRelease()
  assert.deepEqual(
    await readFile(join(first, `cleo-twitch-${sha}.tar.gz`)),
    await readFile(join(second, `cleo-twitch-${sha}.tar.gz`))
  )
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
    "Twitch packaging rejects dirty/untracked sources, symlinks, directories, FIFO and escaping parents; archives are reproducible."
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
