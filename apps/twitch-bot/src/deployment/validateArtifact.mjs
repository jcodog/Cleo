import { createHash } from "node:crypto"
import { lstat, readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"

export const releaseFiles = [
  "package.json",
  "runtime-artifact.json",
  "dist/index.js",
  "dist/scripts/authorizeBot.js",
  "dist/scripts/sendSmokeMessage.js",
  "dist/scripts/checkReadiness.js",
]

export async function validateArtifact(directory, expectedSha) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha))
    throw new Error("Invalid release SHA.")
  const root = await lstat(directory)
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new Error("Invalid release directory.")
  const names = []
  async function walk(relative) {
    for (const entry of await readdir(join(directory, relative), {
      withFileTypes: true,
    })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isSymbolicLink())
        throw new Error("Release symlinks are forbidden.")
      if (entry.isDirectory()) {
        if (path !== "dist" && path !== "dist/scripts")
          throw new Error("Unexpected release directory.")
        await walk(path)
      } else if (entry.isFile()) names.push(path)
      else throw new Error("Only regular release files are permitted.")
    }
  }
  await walk("")
  if (
    JSON.stringify(names.sort()) !==
    JSON.stringify([...releaseFiles, "manifest.json"].sort())
  )
    throw new Error("Unexpected release contents.")
  const readJson = async (name) => {
    const file = join(directory, name)
    if ((await lstat(file)).size > 65536)
      throw new Error("Oversized release metadata.")
    return JSON.parse(await readFile(file, "utf8"))
  }
  const manifest = await readJson("manifest.json")
  const contract = await readJson("runtime-artifact.json")
  const pkg = await readJson("package.json")
  if (
    !manifest ||
    manifest.contractVersion !== 1 ||
    manifest.sha !== expectedSha ||
    manifest.service !== "twitch-bot" ||
    manifest.platform !== "linux-x64" ||
    manifest.nodeVersion !== "v24.15.0" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== releaseFiles.length ||
    !contract ||
    contract.contractVersion !== 1 ||
    contract.service !== "twitch-bot" ||
    contract.packageName !== "@workspace/twitch-bot" ||
    contract.packageVersion !== "0.1.0" ||
    contract.nodeVersion !== "v24.15.0" ||
    contract.platform !== "linux-x64" ||
    contract.runtimeEntrypoint !== "dist/index.js" ||
    contract.smokeEntrypoint !== "dist/scripts/sendSmokeMessage.js" ||
    contract.readinessEntrypoint !== "dist/scripts/checkReadiness.js" ||
    !pkg ||
    pkg.name !== "@workspace/twitch-bot" ||
    pkg.version !== "0.1.0" ||
    pkg.type !== "module" ||
    pkg.dependencies
  )
    throw new Error("Release metadata does not match the Twitch host contract.")
  const seen = new Set()
  for (const entry of manifest.files) {
    if (
      !entry ||
      !releaseFiles.includes(entry.path) ||
      seen.has(entry.path) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 1 ||
      entry.size > 10 * 1024 * 1024
    )
      throw new Error("Invalid release integrity metadata.")
    seen.add(entry.path)
    const path = join(directory, entry.path)
    if ((await lstat(path)).size !== entry.size)
      throw new Error("Release integrity check failed.")
    const content = await readFile(path)
    if (
      content.length !== entry.size ||
      createHash("sha256").update(content).digest("hex") !== entry.sha256
    )
      throw new Error("Release integrity check failed.")
  }
}

export async function main(args = process.argv.slice(2)) {
  try {
    if (args.length !== 2)
      throw new Error("Expected release directory and SHA.")
    await validateArtifact(args[0], args[1])
  } catch {
    process.stderr.write(
      '{"level":"error","namespace":"twitch-artifact","message":"Invalid Twitch release artifact."}\n'
    )
    process.exitCode = 1
  }
}
