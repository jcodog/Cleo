import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
const releasePlatform = "linux-arm64"

function createArtifactFixture(): string {
  const artifactRoot = mkdtempSync(
    path.join(tmpdir(), "cleo-discord-artifact-")
  )

  for (const relativePath of artifactContract.requiredFiles) {
    const filePath = resolveArtifactPath(artifactRoot, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, "fixture\n")
  }

  writeFileSync(
    resolveArtifactPath(artifactRoot, ".cleo-release-sha"),
    releaseSha
  )
  writeFileSync(
    resolveArtifactPath(artifactRoot, ".cleo-release-platform"),
    releasePlatform
  )
  writeFixtureManifest(artifactRoot)

  return artifactRoot
}

function writeFixtureManifest(
  artifactRoot: string,
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
        .update(readFileSync(resolveArtifactPath(artifactRoot, relativePath)))
        .digest("hex"),
    ])
  )
  const manifest = {
    architecture: "arm64",
    artifactContractVersion: artifactContract.schemaVersion,
    artifactValidatorEntrypoint: artifactContract.artifactValidatorEntrypoint,
    buildTimestamp: "2026-07-15T08:49:55Z",
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
  }

  writeFileSync(
    resolveArtifactPath(artifactRoot, artifactContract.releaseManifest),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
}

function updateFixtureManifest(
  artifactRoot: string,
  update: (manifest: Record<string, unknown>) => void
): void {
  const manifestPath = resolveArtifactPath(
    artifactRoot,
    artifactContract.releaseManifest
  )
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >
  update(manifest)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
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

    assert.equal(contract.schemaVersion, 2)
    assert.equal(contract.releaseManifest, "release-manifest.json")
    assert.equal(contract.runtimeEntrypoint, "dist/index.js")
    assert.equal(
      contract.commandRegistrationEntrypoint,
      "dist/scripts/registerCommands.js"
    )
    assert.ok(contract.requiredFiles.includes("dist/index.js.map"))
    assert.ok(
      contract.requiredFiles.includes(
        "node_modules/@napi-rs/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node"
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
      resolveArtifactPath(artifactRoot, "dist/scripts/registerCommands.js")
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
      "linux-x64"
    )

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /release platform linux-x64 does not match linux-arm64/i
    )
  })
})

test("artifact validation rejects a manifest for another commit", async () => {
  await withArtifactFixture((artifactRoot) => {
    writeFixtureManifest(artifactRoot, {
      commitSha: "ffffffffffffffffffffffffffffffffffffffff",
    })

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /manifest SHA .* does not match/
    )
  })
})

for (const invalidManifest of [
  {
    name: "contract version",
    update: (manifest: Record<string, unknown>) => {
      manifest.artifactContractVersion = 999
    },
    error: /contract version is invalid/,
  },
  {
    name: "platform",
    update: (manifest: Record<string, unknown>) => {
      manifest.platform = "darwin"
    },
    error: /manifest platform darwin-arm64 does not match linux-arm64/,
  },
  {
    name: "architecture",
    update: (manifest: Record<string, unknown>) => {
      manifest.architecture = "x64"
    },
    error: /manifest platform linux-x64 does not match linux-arm64/,
  },
  {
    name: "Node version",
    update: (manifest: Record<string, unknown>) => {
      manifest.nodeVersion = "latest"
    },
    error: /manifest Node version is invalid/,
  },
  {
    name: "build timestamp",
    update: (manifest: Record<string, unknown>) => {
      manifest.buildTimestamp = "2026-99-99T99:99:99Z"
    },
    error: /manifest build timestamp is invalid/,
  },
  {
    name: "runtime entrypoint",
    update: (manifest: Record<string, unknown>) => {
      manifest.runtimeEntrypoint = "dist/other.js"
    },
    error: /manifest runtimeEntrypoint is invalid/,
  },
  {
    name: "command registration entrypoint",
    update: (manifest: Record<string, unknown>) => {
      manifest.commandRegistrationEntrypoint = "dist/scripts/other.js"
    },
    error: /manifest commandRegistrationEntrypoint is invalid/,
  },
  {
    name: "artifact validator entrypoint",
    update: (manifest: Record<string, unknown>) => {
      manifest.artifactValidatorEntrypoint = "dist/deployment/other.js"
    },
    error: /manifest artifactValidatorEntrypoint is invalid/,
  },
  {
    name: "non-string build timestamp",
    update: (manifest: Record<string, unknown>) => {
      manifest.buildTimestamp = null
    },
    error: /manifest build timestamp is invalid/,
  },
  {
    name: "non-canonical build timestamp",
    update: (manifest: Record<string, unknown>) => {
      manifest.buildTimestamp = "2026-07-15T08:49:55.000Z"
    },
    error: /manifest build timestamp is invalid/,
  },
] as const) {
  test(`artifact validation rejects an invalid manifest ${invalidManifest.name}`, async () => {
    await withArtifactFixture((artifactRoot) => {
      updateFixtureManifest(artifactRoot, invalidManifest.update)

      assert.throws(
        () =>
          validateReleaseArtifactDirectory(artifactRoot, {
            expectedPlatform: releasePlatform,
            expectedSha: releaseSha,
          }),
        invalidManifest.error
      )
    })
  })
}

test("artifact validation rejects changed compiled output", async () => {
  await withArtifactFixture((artifactRoot) => {
    writeFileSync(
      resolveArtifactPath(artifactRoot, "dist/index.js"),
      "changed\n"
    )

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /critical file hash mismatch: dist\/index\.js/
    )
  })
})

test("artifact validation requires the command fingerprint to own the compiled payload", async () => {
  await withArtifactFixture((artifactRoot) => {
    writeFixtureManifest(artifactRoot, {
      commandFingerprint: "f".repeat(64),
    })

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /command fingerprint is invalid/
    )
  })
})

test("artifact validation requires every critical compiled hash", async () => {
  await withArtifactFixture((artifactRoot) => {
    const manifestPath = resolveArtifactPath(
      artifactRoot,
      artifactContract.releaseManifest
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      criticalFileSha256: Record<string, string>
    }
    delete manifest.criticalFileSha256[artifactContract.runtimeEntrypoint]
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /missing critical hashes: dist\/index\.js/
    )
  })
})

test("artifact validation rejects an empty critical hash set", async () => {
  await withArtifactFixture((artifactRoot) => {
    updateFixtureManifest(artifactRoot, (manifest) => {
      manifest.criticalFileSha256 = {}
    })

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /manifest has no critical file hashes/
    )
  })
})

test("artifact validation rejects malformed critical hashes", async () => {
  await withArtifactFixture((artifactRoot) => {
    updateFixtureManifest(artifactRoot, (manifest) => {
      const criticalHashes = manifest.criticalFileSha256 as Record<
        string,
        string
      >
      criticalHashes[artifactContract.runtimeEntrypoint] = "not-a-hash"
    })

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /manifest hash is invalid: dist\/index\.js/
    )
  })
})

test("artifact validation rejects a malformed command fingerprint", async () => {
  await withArtifactFixture((artifactRoot) => {
    updateFixtureManifest(artifactRoot, (manifest) => {
      manifest.commandFingerprint = "not-a-fingerprint"
    })

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /command fingerprint is invalid/
    )
  })
})

test("artifact validation rejects unsafe critical hash paths", async () => {
  await withArtifactFixture((artifactRoot) => {
    const manifestPath = resolveArtifactPath(
      artifactRoot,
      artifactContract.releaseManifest
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      criticalFileSha256: Record<string, string>
    }
    manifest.criticalFileSha256["../outside"] = "f".repeat(64)
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    assert.throws(
      () =>
        validateReleaseArtifactDirectory(artifactRoot, {
          expectedPlatform: releasePlatform,
          expectedSha: releaseSha,
        }),
      /manifest path is unsafe: \.\.\/outside/
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
