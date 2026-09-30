import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { main, releaseFiles, validateArtifact } from "./validateArtifact.mjs"

const sha = "a".repeat(40)
async function fixture(
  operation: (
    root: string,
    manifest: {
      files: { path: string; size: number; sha256: string }[]
      [key: string]: unknown
    }
  ) => Promise<void>
) {
  const root = await mkdtemp(join(tmpdir(), "cleo-twitch-artifact-"))
  try {
    await mkdir(join(root, "dist/scripts"), { recursive: true })
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@workspace/twitch-bot",
        version: "0.1.0",
        type: "module",
      })
    )
    await writeFile(
      join(root, "runtime-artifact.json"),
      await readFile(new URL("../../runtime-artifact.json", import.meta.url))
    )
    const files = []
    for (const path of releaseFiles) {
      if (path.endsWith(".js")) await writeFile(join(root, path), "export {}\n")
      const content = await readFile(join(root, path))
      files.push({
        path,
        size: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      })
    }
    const manifest = {
      contractVersion: 1,
      sha,
      service: "twitch-bot",
      platform: "linux-x64",
      nodeVersion: "v24.15.0",
      files,
    }
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest))
    await operation(root, manifest)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test("artifact validation accepts only the intended complete immutable package", async () => {
  await fixture(async (root) => {
    await validateArtifact(root, sha)
    const exit = process.exitCode
    await main([root, sha])
    assert.equal(process.exitCode, exit)
    await assert.rejects(validateArtifact(root, "main"), /SHA/)
    await assert.rejects(
      validateArtifact(join(root, "package.json"), sha),
      /directory/
    )
    await assert.rejects(validateArtifact(root, "b".repeat(40)), /metadata/)
    await writeFile(join(root, "dist/index.js"), "changed")
    await assert.rejects(validateArtifact(root, sha), /integrity/)
  })
  await fixture(async (root) => {
    const path = join(root, "dist/index.js")
    const content = await readFile(path)
    content[0] = 0
    await writeFile(path, content)
    await assert.rejects(validateArtifact(root, sha), /integrity/)
  })
})

test("rejects secrets, unexpected directories, symlinks and oversized metadata", async () => {
  for (const kind of [
    "env",
    "directory",
    "link",
    "oversize",
    "malformed",
  ] as const)
    await fixture(async (root) => {
      if (kind === "env") await writeFile(join(root, ".env"), "TEST_ONLY=bad")
      if (kind === "directory") await mkdir(join(root, "cache"))
      if (kind === "link") {
        await rm(join(root, "dist/index.js"))
        await symlink(join(root, "package.json"), join(root, "dist/index.js"))
      }
      if (kind === "oversize")
        await writeFile(join(root, "manifest.json"), " ".repeat(65537))
      if (kind === "malformed")
        await writeFile(join(root, "manifest.json"), "{")
      await assert.rejects(validateArtifact(root, sha))
    })
})

test("rejects forged contract, package and integrity claims", async () => {
  for (const file of ["manifest.json", "runtime-artifact.json"])
    await fixture(async (root) => {
      await writeFile(join(root, file), "null")
      await assert.rejects(validateArtifact(root, sha))
    })
  const invalidManifest = [
    { contractVersion: 2 },
    { service: "discord-bot" },
    { platform: "win32-x64" },
    { nodeVersion: "v20.0.0" },
    { files: null },
    { files: [] },
  ]
  for (const invalid of invalidManifest)
    await fixture(async (root, manifest) => {
      await writeFile(
        join(root, "manifest.json"),
        JSON.stringify({ ...manifest, ...invalid })
      )
      await assert.rejects(validateArtifact(root, sha))
    })
  for (const field of [
    "contractVersion",
    "service",
    "packageName",
    "packageVersion",
    "nodeVersion",
    "platform",
    "runtimeEntrypoint",
    "smokeEntrypoint",
    "readinessEntrypoint",
  ])
    await fixture(async (root) => {
      const contract = JSON.parse(
        await readFile(join(root, "runtime-artifact.json"), "utf8")
      )
      contract[field] = "wrong"
      await writeFile(
        join(root, "runtime-artifact.json"),
        JSON.stringify(contract)
      )
      await assert.rejects(validateArtifact(root, sha))
    })
  for (const pkg of [
    null,
    {},
    { name: "@workspace/twitch-bot", version: "wrong" },
    { name: "@workspace/twitch-bot", version: "0.1.0", type: "commonjs" },
    {
      name: "@workspace/twitch-bot",
      version: "0.1.0",
      type: "module",
      dependencies: {},
    },
  ])
    await fixture(async (root) => {
      await writeFile(join(root, "package.json"), JSON.stringify(pkg))
      await assert.rejects(validateArtifact(root, sha))
    })
  for (const entry of [
    null,
    { path: "../secret" },
    { path: "package.json", sha256: "wrong" },
    { path: "package.json", sha256: "a".repeat(64), size: 1.5 },
    { path: "package.json", sha256: "a".repeat(64), size: 0 },
    { path: "package.json", sha256: "a".repeat(64), size: 10485761 },
  ])
    await fixture(async (root, manifest) => {
      await writeFile(
        join(root, "manifest.json"),
        JSON.stringify({
          ...manifest,
          files: [entry, ...manifest.files.slice(1)],
        })
      )
      await assert.rejects(validateArtifact(root, sha))
    })
  await fixture(async (root, manifest) => {
    manifest.files[1] = manifest.files[0]!
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest))
    await assert.rejects(validateArtifact(root, sha))
  })
})

test("artifact CLI reports a fixed safe failure without leaking paths or metadata", async () => {
  const original = process.stderr.write
  const exit = process.exitCode
  let output = ""
  process.stderr.write = ((chunk: string) => {
    output += chunk
    return true
  }) as typeof process.stderr.write
  try {
    await main([])
    await main(["test-only-private-path", sha])
    assert.equal(process.exitCode, 1)
    assert.equal(output.includes("test-only-private-path"), false)
  } finally {
    process.stderr.write = original
    process.exitCode = exit
  }
})
