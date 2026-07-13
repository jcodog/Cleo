import { rm } from "node:fs/promises"
import { fileURLToPath, URL } from "node:url"

import { build } from "esbuild"

import artifactContract from "../runtime-artifact.json" with { type: "json" }

const packageRoot = fileURLToPath(new URL("../", import.meta.url))
const outputDirectory = fileURLToPath(new URL("../dist", import.meta.url))

function outputName(relativeOutputPath) {
  const prefix = "dist/"
  const suffix = ".js"

  if (
    !relativeOutputPath.startsWith(prefix) ||
    !relativeOutputPath.endsWith(suffix)
  ) {
    throw new Error(`Invalid compiled Discord entrypoint: ${relativeOutputPath}`)
  }

  return relativeOutputPath.slice(prefix.length, -suffix.length)
}

await rm(outputDirectory, { recursive: true, force: true })

await build({
  absWorkingDir: packageRoot,
  bundle: true,
  entryPoints: {
    [outputName(artifactContract.runtimeEntrypoint)]: "src/index.ts",
    [outputName(artifactContract.commandRegistrationEntrypoint)]:
      "src/scripts/registerCommands.ts",
    [outputName(artifactContract.artifactValidatorEntrypoint)]:
      "src/deployment/validateReleaseArtifact.ts",
  },
  external: [
    "@napi-rs/canvas",
    "discord.js",
  ],
  format: "esm",
  legalComments: "none",
  logLevel: "info",
  outdir: outputDirectory,
  platform: "node",
  sourcemap: true,
  sourcesContent: true,
  target: "node24",
})
