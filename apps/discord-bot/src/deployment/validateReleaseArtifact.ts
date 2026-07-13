import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import artifactContract from "../../runtime-artifact.json" with { type: "json" }

export type DiscordReleaseArtifactContract = typeof artifactContract

type ValidateReleaseArtifactOptions = {
  expectedPlatform: string
  expectedSha: string
}

const SHA_PATTERN = /^[0-9a-f]{40}$/

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
    (relativePath) => !existsSync(resolveArtifactPath(artifactRoot, relativePath))
  )

  if (missingFiles.length > 0) {
    throw new Error(
      `Discord release artifact is missing required files: ${missingFiles.join(", ")}`
    )
  }

  const forbiddenFiles = artifactContract.forbiddenFiles.filter((relativePath) =>
    existsSync(resolveArtifactPath(artifactRoot, relativePath))
  )

  if (forbiddenFiles.length > 0) {
    throw new Error(
      `Discord release artifact contains forbidden production files: ${forbiddenFiles.join(", ")}`
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

  return artifactContract
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

function readArtifactMarker(artifactRoot: string, marker: string): string {
  return readFileSync(resolveArtifactPath(artifactRoot, marker), "utf8").trim()
}
