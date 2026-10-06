import { execFileSync } from "node:child_process"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

const webFiles = new Set([
  "packages/env/src/dashboard.ts",
  "packages/env/src/landing.ts",
  "packages/env/src/origins.ts",
  "packages/env/src/origins.test.ts",
  "packages/shared/src/appRoutes.ts",
  "packages/shared/src/appRoutes.test.ts",
  "apps/discord-bot/src/deployment/classifyChanges.ts",
  "apps/discord-bot/src/deployment/classifyChanges.test.ts",
  "apps/discord-bot/src/deployment/webOnlyChanges.ts",
  "apps/discord-bot/src/deployment/webOnlyChanges.test.ts",
])

export function isWebOnlyPath(file: string): boolean {
  return (
    file.startsWith("apps/landing/") ||
    file.startsWith("apps/dashboard/") ||
    webFiles.has(file)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Follow Bun's package-location keys, including nested versions and workspace links.
function lockPackagesUsedBy(
  workspaces: Record<string, unknown>,
  packages: Record<string, unknown>,
  roots: unknown[]
): Set<string> {
  const used = new Set<string>()
  function visitDependencies(metadata: unknown, context: string) {
    if (!isRecord(metadata)) return
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const dependencies = metadata[field]
      if (dependencies === undefined) continue
      if (!isRecord(dependencies))
        throw new Error("Invalid lockfile dependencies")
      for (const name of Object.keys(dependencies)) {
        const ancestors = context.match(/(?:@[^/]+\/)?[^/]+/g) ?? []
        let key = name
        while (ancestors.length > 0) {
          const candidate = `${ancestors.join("/")}/${name}`
          if (candidate in packages) {
            key = candidate
            break
          }
          ancestors.pop()
        }
        const entry = packages[key]
        if (
          entry === undefined &&
          ["optionalDependencies", "peerDependencies"].includes(field)
        )
          continue
        if (!Array.isArray(entry) || typeof entry[0] !== "string")
          throw new Error("Unresolved lockfile dependency")
        if (used.has(key)) continue
        used.add(key)
        if (entry[0].startsWith("workspace:")) {
          const workspace = workspaces[entry[0].slice("workspace:".length)]
          if (!isRecord(workspace))
            throw new Error("Unresolved lockfile workspace")
          visitDependencies(workspace, key)
        } else {
          visitDependencies(entry[2], key)
        }
      }
    }
  }
  for (const root of roots) {
    if (!isRecord(root)) throw new Error("Invalid lockfile workspace")
    visitDependencies(root, typeof root.name === "string" ? root.name : "")
  }
  return used
}

function configWithoutWebEntries(file: string, source: string): unknown {
  const config: unknown = JSON.parse(withoutTrailingCommas(source))
  if (!isRecord(config)) throw new Error("Invalid configuration")
  if (file === "bun.lock") {
    if (!isRecord(config.workspaces) || !isRecord(config.packages))
      throw new Error("Invalid lockfile")
    const landing = config.workspaces["apps/landing"]
    if (landing !== undefined) {
      const landingPackages = lockPackagesUsedBy(
        config.workspaces,
        config.packages,
        [landing]
      )
      const runtimePackages = lockPackagesUsedBy(
        config.workspaces,
        config.packages,
        Object.entries(config.workspaces)
          .filter(([name]) => name !== "apps/landing")
          .map(([, workspace]) => workspace)
      )
      for (const key of landingPackages) {
        if (!runtimePackages.has(key)) delete config.packages[key]
      }
    }
    delete config.workspaces["apps/landing"]
    delete config.packages["@workspace/landing"]
  } else if (file === "turbo.json") {
    if (!Array.isArray(config.globalEnv))
      throw new Error("Invalid Turbo environment")
    config.globalEnv = config.globalEnv.filter(
      (name: unknown) =>
        !["NEXT_PUBLIC_SITE_URL", "VERCEL_URL", "VERCEL_ENV"].includes(
          String(name)
        )
    )
    if (Array.isArray(config.globalPassThroughEnv)) {
      const passThrough = config.globalPassThroughEnv.filter(
        (name) => name !== "VERCEL_URL"
      )
      config.globalPassThroughEnv = passThrough
      if (passThrough.length === 0) delete config.globalPassThroughEnv
    }
  } else {
    if (!isRecord(config.exports)) throw new Error("Invalid package exports")
    for (const key of ["./landing", "./origins", "./appRoutes"])
      delete config.exports[key]
  }
  return config
}

function withoutTrailingCommas(source: string): string {
  let quoted = false
  let escaped = false
  let result = ""
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === ",") {
      let next = index + 1
      while (next < source.length && /\s/.test(source[next] ?? "")) next++
      if (source[next] === "}" || source[next] === "]") continue
    }
    result += character
  }
  return result
}

export function isWebOnlyConfigChange(
  file: string,
  before: string,
  after: string
): boolean {
  if (
    ![
      "bun.lock",
      "turbo.json",
      "packages/env/package.json",
      "packages/shared/package.json",
    ].includes(file)
  )
    return false
  try {
    return isDeepStrictEqual(
      configWithoutWebEntries(file, before),
      configWithoutWebEntries(file, after)
    )
  } catch {
    // Unknown/invalid inputs retain the existing conservative deployment behavior.
    return false
  }
}

const DEPLOY_PREFIXES = [
  "apps/discord-bot/",
  "packages/backend/",
  "packages/env/",
  "packages/logger/",
  "packages/shared/",
  "packages/typescript-config/",
  "ops/discord/",
] as const

const DEPLOY_FILES = new Set<string>([
  ".github/scripts/check-discord-bundle-symlinks.sh",
  ".github/scripts/package-discord-release.sh",
  ".github/workflows/discord-production.yml",
  ".nvmrc",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "turbo.json",
])

const COMMAND_PREFIXES = ["apps/discord-bot/src/handlers/commands/"] as const

const COMMAND_FILES = new Set<string>([
  "apps/discord-bot/src/classes/Command.ts",
  "apps/discord-bot/src/loaders/loadCommands.ts",
  "apps/discord-bot/src/scripts/registerCommands.ts",
])

export function isConvexDeployPath(file: string): boolean {
  if (isWebOnlyPath(file)) return false
  return (
    [
      "packages/backend/",
      "packages/env/",
      "packages/logger/",
      "packages/shared/",
      "packages/typescript-config/",
    ].some((prefix) => file.startsWith(prefix)) ||
    [
      "package.json",
      "bun.lock",
      "bunfig.toml",
      "turbo.json",
      ".nvmrc",
      "convex.json",
    ].includes(file) ||
    /^tsconfig(?:\.[^/]+)?\.json$/.test(file) ||
    /^(?:apps|packages)\/[^/]+\/package\.json$/.test(file)
  )
}

export function isDiscordDeployPath(file: string): boolean {
  if (isWebOnlyPath(file)) return false
  return (
    DEPLOY_FILES.has(file) ||
    DEPLOY_PREFIXES.some((prefix) => file.startsWith(prefix))
  )
}

export function isCommandRegistrationPath(file: string): boolean {
  return (
    COMMAND_FILES.has(file) ||
    COMMAND_PREFIXES.some((prefix) => file.startsWith(prefix))
  )
}

export function isTwitchDeployPath(file: string): boolean {
  return (
    !isWebOnlyPath(file) &&
    (file.startsWith("apps/twitch-bot/") ||
      file.startsWith("ops/twitch/") ||
      isConvexDeployPath(file))
  )
}

export function classifyChangedPaths(files: string[]) {
  return {
    deploy: files.some(isDiscordDeployPath),
    registerCommands: files.some(isCommandRegistrationPath),
  }
}

function changedPathsBetween(
  baseSha: string,
  headSha: string
): string[] | null {
  if (!baseSha) {
    return null
  }

  try {
    execFileSync("git", ["cat-file", "-e", `${baseSha}^{commit}`], {
      stdio: "ignore",
    })
  } catch {
    return null
  }

  return execFileSync("git", ["diff", "--name-only", baseSha, headSha], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => {
      if (isWebOnlyPath(file)) return false
      if (
        ![
          "bun.lock",
          "turbo.json",
          "packages/env/package.json",
          "packages/shared/package.json",
        ].includes(file)
      )
        return true
      return !isWebOnlyConfigChange(
        file,
        execFileSync("git", ["show", `${baseSha}:${file}`], {
          encoding: "utf8",
        }),
        execFileSync("git", ["show", `${headSha}:${file}`], {
          encoding: "utf8",
        })
      )
    })
}

function isDirectEntrypoint(): boolean {
  const entrypoint = process.argv[1]
  return (
    entrypoint !== undefined &&
    pathToFileURL(path.resolve(entrypoint)).href === import.meta.url
  )
}

if (isDirectEntrypoint()) {
  const [, , mode = "commands", baseSha = "", headSha = "HEAD"] = process.argv
  const changedPaths = changedPathsBetween(baseSha, headSha)
  const changed =
    changedPaths === null
      ? true
      : mode === "backend"
        ? changedPaths.some(isConvexDeployPath)
        : mode === "twitch"
          ? changedPaths.some(isTwitchDeployPath)
          : mode === "deploy"
            ? classifyChangedPaths(changedPaths).deploy
            : classifyChangedPaths(changedPaths).registerCommands
  process.stdout.write(String(changed))
}
