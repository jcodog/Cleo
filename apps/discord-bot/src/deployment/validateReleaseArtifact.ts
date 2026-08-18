import { createHash } from "node:crypto"
import { existsSync, lstatSync, readFileSync } from "node:fs"
import path from "node:path"

import artifactContract from "../../runtime-artifact.json" with { type: "json" }

export type DiscordReleaseArtifactContract = typeof artifactContract

export type DiscordReleaseManifest = {
  architecture: string
  artifactContractVersion: number
  artifactValidatorEntrypoint: string
  buildTimestamp: string
  commandFingerprint: string
  commandRegistrationEntrypoint: string
  commitSha: string
  criticalFileSha256: Record<string, string>
  nodeVersion: string
  platform: string
  runtimeEntrypoint: string
}

type ValidateReleaseArtifactOptions = {
  expectedPlatform: string
  expectedSha: string
}

const SHA_PATTERN = /^[0-9a-f]{40}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const BUILD_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

function resolveRegularArtifactFile(
  artifactRoot: string,
  relativePath: string
): string {
  const segments = relativePath.split("/")
  let currentPath = path.resolve(artifactRoot)

  for (const [index, segment] of segments.entries()) {
    currentPath = path.join(currentPath, segment)
    const currentStat = lstatSync(currentPath, { throwIfNoEntry: false })
    const isLast = index === segments.length - 1
    if (
      currentStat === undefined ||
      currentStat.isSymbolicLink() ||
      (isLast ? !currentStat.isFile() : !currentStat.isDirectory())
    ) {
      throw new Error(
        `Discord release critical file must use regular non-symlink path components: ${relativePath}`
      )
    }
  }

  return currentPath
}

export function resolveArtifactPath(
  artifactRoot: string,
  relativePath: string
): string {
  return path.resolve(artifactRoot, ...relativePath.split("/"))
}

export function validateReleaseArtifactDirectory(
  artifactRoot: string,
  { expectedPlatform, expectedSha }: ValidateReleaseArtifactOptions
): DiscordReleaseArtifactContract {
  if (!SHA_PATTERN.test(expectedSha)) {
    throw new Error(`Expected release SHA is invalid: ${expectedSha}`)
  }

  const missingFiles = artifactContract.requiredFiles.filter(
    (relativePath) =>
      !existsSync(resolveArtifactPath(artifactRoot, relativePath))
  )

  if (missingFiles.length > 0) {
    throw new Error(
      `Discord release artifact is missing required files: ${missingFiles.join(", ")}`
    )
  }

  const forbiddenFiles = artifactContract.forbiddenFiles.filter(
    (relativePath) =>
      existsSync(resolveArtifactPath(artifactRoot, relativePath))
  )

  const forbiddenPathPrefixes = artifactContract.forbiddenPathPrefixes.filter(
    (relativePath) =>
      lstatSync(resolveArtifactPath(artifactRoot, relativePath.slice(0, -1)), {
        throwIfNoEntry: false,
      }) !== undefined
  )

  const forbiddenPaths = [...forbiddenFiles, ...forbiddenPathPrefixes]

  if (forbiddenPaths.length > 0) {
    throw new Error(
      `Discord release artifact contains forbidden production files: ${forbiddenPaths.join(", ")}`
    )
  }

  const artifactSha = readArtifactMarker(artifactRoot, ".cleo-release-sha")

  if (artifactSha !== expectedSha) {
    throw new Error(
      `Discord release artifact SHA ${artifactSha} does not match ${expectedSha}`
    )
  }

  const artifactPlatform = readArtifactMarker(
    artifactRoot,
    ".cleo-release-platform"
  )

  if (artifactPlatform !== expectedPlatform) {
    throw new Error(
      `Discord release platform ${artifactPlatform} does not match ${expectedPlatform}`
    )
  }

  validateReleaseManifest(artifactRoot, { expectedPlatform, expectedSha })

  return artifactContract
}

export function readReleaseManifest(
  artifactRoot: string
): DiscordReleaseManifest {
  const manifestPath = resolveArtifactPath(
    artifactRoot,
    artifactContract.releaseManifest
  )
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8")
  ) as DiscordReleaseManifest

  return manifest
}

export function validateReleaseManifest(
  artifactRoot: string,
  { expectedPlatform, expectedSha }: ValidateReleaseArtifactOptions
): DiscordReleaseManifest {
  const manifest = readReleaseManifest(artifactRoot)
  const [platform, architecture] = expectedPlatform.split("-", 2)

  if (manifest.artifactContractVersion !== artifactContract.schemaVersion) {
    throw new Error("Discord release manifest contract version is invalid")
  }
  if (manifest.commitSha !== expectedSha) {
    throw new Error(
      `Discord release manifest SHA ${manifest.commitSha} does not match ${expectedSha}`
    )
  }
  if (
    manifest.platform !== platform ||
    manifest.architecture !== architecture
  ) {
    throw new Error(
      `Discord release manifest platform ${manifest.platform}-${manifest.architecture} does not match ${expectedPlatform}`
    )
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.nodeVersion)) {
    throw new Error("Discord release manifest Node version is invalid")
  }
  if (!isCanonicalBuildTimestamp(manifest.buildTimestamp)) {
    throw new Error("Discord release manifest build timestamp is invalid")
  }

  const expectedEntrypoints = {
    artifactValidatorEntrypoint: artifactContract.artifactValidatorEntrypoint,
    commandRegistrationEntrypoint:
      artifactContract.commandRegistrationEntrypoint,
    runtimeEntrypoint: artifactContract.runtimeEntrypoint,
  }
  for (const [key, expectedValue] of Object.entries(expectedEntrypoints)) {
    if (manifest[key as keyof typeof expectedEntrypoints] !== expectedValue) {
      throw new Error(`Discord release manifest ${key} is invalid`)
    }
  }

  const criticalEntries = Object.entries(manifest.criticalFileSha256)
  if (criticalEntries.length === 0) {
    throw new Error("Discord release manifest has no critical file hashes")
  }
  const expectedCriticalPaths = [
    artifactContract.runtimeEntrypoint,
    `${artifactContract.runtimeEntrypoint}.map`,
    artifactContract.commandRegistrationEntrypoint,
    `${artifactContract.commandRegistrationEntrypoint}.map`,
    artifactContract.artifactValidatorEntrypoint,
    `${artifactContract.artifactValidatorEntrypoint}.map`,
  ]
  const missingCriticalHashes = expectedCriticalPaths.filter(
    (relativePath) => manifest.criticalFileSha256[relativePath] === undefined
  )
  if (missingCriticalHashes.length > 0) {
    throw new Error(
      `Discord release manifest is missing critical hashes: ${missingCriticalHashes.join(", ")}`
    )
  }
  for (const [relativePath, expectedHash] of criticalEntries) {
    if (!isSafeArchivePath(relativePath)) {
      throw new Error(
        `Discord release manifest path is unsafe: ${relativePath}`
      )
    }
    if (!SHA256_PATTERN.test(expectedHash)) {
      throw new Error(
        `Discord release manifest hash is invalid: ${relativePath}`
      )
    }

    const criticalPath = resolveRegularArtifactFile(artifactRoot, relativePath)

    const actualHash = createHash("sha256")
      .update(readFileSync(criticalPath))
      .digest("hex")
    if (actualHash !== expectedHash) {
      throw new Error(
        `Discord release critical file hash mismatch: ${relativePath}`
      )
    }
  }

  const commandHash =
    manifest.criticalFileSha256[artifactContract.commandRegistrationEntrypoint]
  if (
    !SHA256_PATTERN.test(manifest.commandFingerprint) ||
    manifest.commandFingerprint !== commandHash
  ) {
    throw new Error("Discord release command fingerprint is invalid")
  }

  return manifest
}

export function assertSafeArchivePaths(entries: readonly string[]): void {
  const unsafePaths = entries.filter((entry) => !isSafeArchivePath(entry))

  if (unsafePaths.length > 0) {
    throw new Error(
      `Discord release archive contains unsafe paths: ${unsafePaths.join(", ")}`
    )
  }
}

export function isSafeArchivePath(entry: string): boolean {
  const normalizedEntry = entry.replaceAll("\\", "/")

  return (
    !normalizedEntry.startsWith("/") &&
    normalizedEntry.split("/").every((segment) => segment !== "..")
  )
}

function isCanonicalBuildTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !BUILD_TIMESTAMP_PATTERN.test(value)) {
    return false
  }

  const parsed = Date.parse(value)
  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString() === `${value.slice(0, -1)}.000Z`
  )
}

function readArtifactMarker(artifactRoot: string, marker: string): string {
  return readFileSync(resolveArtifactPath(artifactRoot, marker), "utf8").trim()
}
