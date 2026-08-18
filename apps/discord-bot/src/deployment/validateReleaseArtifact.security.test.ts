import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import artifactContract from "../../runtime-artifact.json" with { type: "json" }
import {
  resolveArtifactPath,
  validateReleaseArtifactDirectory,
} from "./validateReleaseArtifact"

const releaseSha = "0123456789abcdef0123456789abcdef01234567"
const releasePlatform = "linux-x64"

function createArtifactFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "cleo-discord-security-"))

  for (const relativePath of artifactContract.requiredFiles) {
    const filePath = resolveArtifactPath(root, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, "fixture\n")
  }

  writeFileSync(resolveArtifactPath(root, ".cleo-release-sha"), releaseSha)
  writeFileSync(
    resolveArtifactPath(root, ".cleo-release-platform"),
    releasePlatform
  )
  writeManifest(root)
  return root
}

function writeManifest(
  root: string,
  overrides: Record<string, unknown> = {}
): void {
  const criticalPaths = [
    artifactContract.runtimeEntrypoint,
    `${artifactContract.runtimeEntrypoint}.map`,
    artifactContract.commandRegistrationEntrypoint,
    `${artifactContract.commandRegistrationEntrypoint}.map`,
    artifactContract.artifactValidatorEntrypoint,
    `${artifactContract.artifactValidatorEntrypoint}.map`,
  ]
  const criticalFileSha256 = Object.fromEntries(
    criticalPaths.map((relativePath) => [
      relativePath,
      createHash("sha256")
        .update(readFileSync(resolveArtifactPath(root, relativePath)))
        .digest("hex"),
    ])
  )

  writeFileSync(
    resolveArtifactPath(root, artifactContract.releaseManifest),
    `${JSON.stringify(
      {
        architecture: "x64",
        artifactContractVersion: artifactContract.schemaVersion,
        artifactValidatorEntrypoint:
          artifactContract.artifactValidatorEntrypoint,
        buildTimestamp: "2026-08-17T12:59:17Z",
        commandFingerprint:
          criticalFileSha256[artifactContract.commandRegistrationEntrypoint],
        commandRegistrationEntrypoint:
          artifactContract.commandRegistrationEntrypoint,
        commitSha: releaseSha,
        criticalFileSha256,
        nodeVersion: "24.15.0",
        platform: "linux",
        runtimeEntrypoint: artifactContract.runtimeEntrypoint,
        ...overrides,
      },
      null,
      2
    )}\n`
  )
}

async function withFixture(run: (root: string) => void): Promise<void> {
  const root = createArtifactFixture()
  try {
    run(root)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

test("release validation rejects impossible canonical-looking dates", async () => {
  await withFixture((root) => {
    writeManifest(root, { buildTimestamp: "2026-02-31T08:49:55Z" })

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(root, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /manifest build timestamp is invalid/
    )
  })
})

test("release validation rejects symlinked critical files even when hashes match", async () => {
  await withFixture((root) => {
    const runtimePath = resolveArtifactPath(
      root,
      artifactContract.runtimeEntrypoint
    )
    rmSync(runtimePath)
    symlinkSync(
      path.basename(`${artifactContract.runtimeEntrypoint}.map`),
      runtimePath
    )
    writeManifest(root)

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(root, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /critical file must use regular non-symlink path components/
    )
  })
})

test("release validation rejects symlinked parent directories for critical files", async () => {
  await withFixture((root) => {
    const distPath = resolveArtifactPath(root, "dist")
    const realDistPath = resolveArtifactPath(root, "dist-real")
    renameSync(distPath, realDistPath)
    symlinkSync("dist-real", distPath, "dir")
    writeManifest(root)

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(root, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /critical file must use regular non-symlink path components/
    )
  })
})
