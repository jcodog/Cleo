import assert from "node:assert/strict"
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import artifactContract from "../../runtime-artifact.json" with { type: "json" }

import {
  assertSafeArchivePaths,
  isSafeArchivePath,
  resolveArtifactPath,
  validateReleaseArtifactDirectory,
} from "./validateReleaseArtifact"

const releaseSha = "0123456789abcdef0123456789abcdef01234567"
const releasePlatform = "linux-x64"

function createArtifactFixture(): string {
  const artifactRoot = mkdtempSync(path.join(tmpdir(), "cleo-discord-artifact-"))

  for (const relativePath of artifactContract.requiredFiles) {
    const filePath = resolveArtifactPath(artifactRoot, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, "fixture\n")
  }

  writeFileSync(resolveArtifactPath(artifactRoot, ".cleo-release-sha"), releaseSha)
  writeFileSync(
    resolveArtifactPath(artifactRoot, ".cleo-release-platform"),
    releasePlatform
  )

  return artifactRoot
}

function withArtifactFixture(
  run: (artifactRoot: string) => void | Promise<void>
): Promise<void> {
  const artifactRoot = createArtifactFixture()

  return Promise.resolve()
    .then(() => run(artifactRoot))
    .finally(() => {
      rmSync(artifactRoot, { force: true, recursive: true })
    })
}

test("compiled artifact validates runtime, command, metadata, and native files", async () => {
  await withArtifactFixture((artifactRoot) => {
    const contract = validateReleaseArtifactDirectory(artifactRoot, {
      expectedPlatform: releasePlatform,
      expectedSha: releaseSha,
    })

    assert.equal(contract.schemaVersion, 1)
    assert.equal(contract.runtimeEntrypoint, "dist/index.js")
    assert.equal(
      contract.commandRegistrationEntrypoint,
      "dist/scripts/registerCommands.js"
    )
    assert.ok(contract.requiredFiles.includes("dist/index.js.map"))
    assert.ok(
      contract.requiredFiles.includes(
        "node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node"
      )
    )
    assert.equal(
      resolveArtifactPath(artifactRoot, contract.runtimeEntrypoint),
      path.join(artifactRoot, "dist", "index.js")
    )
  })
})

test("artifact validation reports every missing compiled file", async () => {
  await withArtifactFixture((artifactRoot) => {
    rmSync(resolveArtifactPath(artifactRoot, "dist/index.js"))
    rmSync(
      resolveArtifactPath(
        artifactRoot,
        "dist/scripts/registerCommands.js"
      )
    )

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /dist\/index\.js, dist\/scripts\/registerCommands\.js/
    )
  })
})

test("artifact validation rejects production TypeScript and tsx", async () => {
  await withArtifactFixture((artifactRoot) => {
    for (const relativePath of artifactContract.forbiddenFiles) {
      const filePath = resolveArtifactPath(artifactRoot, relativePath)
      mkdirSync(path.dirname(filePath), { recursive: true })
      writeFileSync(filePath, "forbidden\n")
    }

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /src\/index\.ts, node_modules\/tsx\/dist\/cli\.mjs/
    )
  })
})

test("artifact validation rejects every descendant of forbidden prefixes", async () => {
  await withArtifactFixture((artifactRoot) => {
    for (const relativePath of [
      "src/runtime/startup.ts",
      "node_modules/tsx/package.json",
    ]) {
      const filePath = resolveArtifactPath(artifactRoot, relativePath)
      mkdirSync(path.dirname(filePath), { recursive: true })
      writeFileSync(filePath, "forbidden\n")
    }

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /src\/, node_modules\/tsx\//
    )
  })
})

test("artifact validation rejects symlinked forbidden prefixes", async () => {
  await withArtifactFixture((artifactRoot) => {
    symlinkSync(
      resolveArtifactPath(artifactRoot, "dist"),
      resolveArtifactPath(artifactRoot, "src"),
      process.platform === "win32" ? "junction" : "dir"
    )

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /forbidden production files: src\//
    )
  })
})

test("artifact validation requires an exact expected SHA", async () => {
  await withArtifactFixture((artifactRoot) => {
    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: "main",
        }),
      /Expected release SHA is invalid/
    )
  })
})

test("artifact validation rejects mismatched rollback metadata", async () => {
  await withArtifactFixture((artifactRoot) => {
    writeFileSync(
      resolveArtifactPath(artifactRoot, ".cleo-release-sha"),
      "ffffffffffffffffffffffffffffffffffffffff"
    )

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /artifact SHA .* does not match/
    )

    writeFileSync(
      resolveArtifactPath(artifactRoot, ".cleo-release-sha"),
      releaseSha
    )
    writeFileSync(
      resolveArtifactPath(artifactRoot, ".cleo-release-platform"),
      "linux-arm64"
    )

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /release platform linux-arm64 does not match linux-x64/i
    )
  })
})

test("archive path validation accepts package paths and rejects traversal", () => {
  const safePaths = [
    "./dist/index.js",
    "node_modules/@napi-rs/canvas/package.json",
  ]

  assertSafeArchivePaths(safePaths)
  assert.equal(isSafeArchivePath("../outside"), false)
  assert.equal(isSafeArchivePath("dist/../../outside"), false)
  assert.equal(isSafeArchivePath("/absolute/path"), false)
  assert.equal(isSafeArchivePath("dist\\..\\outside"), false)
  assert.equal(isSafeArchivePath("dist/index.js"), true)

  assert.throws(
    () => assertSafeArchivePaths(["dist/index.js", "../outside"]),
    /contains unsafe paths: \.\.\/outside/
  )
})
