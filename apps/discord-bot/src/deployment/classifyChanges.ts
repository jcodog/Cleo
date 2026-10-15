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
  "apps/discord-bot/src/deployment/webOnlyChanges.ts",
  "apps/discord-bot/src/deployment/webOnlyChanges.test.ts",
])

/** Return whether a repository-relative path belongs only to web apps or their explicitly shared web helpers. */
export function isWebOnlyPath(file: string): boolean {
  return (
    file.startsWith("apps/landing/") ||
    file.startsWith("apps/dashboard/") ||
    webFiles.has(file)
  )
}

/** Narrow parsed JSON at the configuration boundary; arrays and null are not configuration records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Follow Bun package-location keys through nested dependencies and workspace links.
 * @returns Package keys reachable from the supplied workspace roots.
 * @throws If required dependencies cannot be resolved, preventing unsafe web-only filtering.
 */
function lockPackagesUsedBy(
  workspaces: Record<string, unknown>,
  packages: Record<string, unknown>,
  roots: unknown[]
): Set<string> {
  const used = new Set<string>()
  /** Traverse each reachable lock entry once; optional/peer entries may legitimately be absent. */
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

/** Strip only known web-exclusive settings/dependencies; malformed or unresolved input throws to the conservative caller. */
function configWithoutWebEntries(file: string, source: string): unknown {
  const config: unknown = JSON.parse(withoutTrailingCommas(source))
  if (!isRecord(config)) throw new Error("Invalid configuration")
  if (file === "bun.lock") {
    if (!isRecord(config.workspaces) || !isRecord(config.packages))
      throw new Error("Invalid lockfile")
    const webWorkspaces = ["apps/landing", "apps/dashboard"]
    const webRoots: unknown[] = []
    for (const name of webWorkspaces) {
      if (config.workspaces[name] !== undefined)
        webRoots.push(config.workspaces[name])
    }
    if (webRoots.length > 0) {
      const webPackages = lockPackagesUsedBy(
        config.workspaces,
        config.packages,
        webRoots
      )
      const runtimePackages = lockPackagesUsedBy(
        config.workspaces,
        config.packages,
        Object.entries(config.workspaces)
          .filter(([name]) => !webWorkspaces.includes(name))
          .map(([, workspace]) => workspace)
      )
      for (const key of webPackages) {
        if (!runtimePackages.has(key)) delete config.packages[key]
      }
    }
    delete config.workspaces["apps/landing"]
    delete config.workspaces["apps/dashboard"]
    delete config.packages["@workspace/landing"]
    delete config.packages["@workspace/dashboard"]
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

/** Remove JSONC-style trailing commas while preserving quoted commas and escapes in Bun configuration text. */
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

/**
 * Compare supported configuration after removing known web-only entries.
 * @param file Repository-relative supported config path.
 * @param before Previous commit's complete file content.
 * @param after Intended release's complete file content.
 * @returns True only when non-web configuration is provably equal; parse failures remain deployment-relevant.
 */
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
  "scripts/assets/",
] as const

const DEPLOY_FILES = new Set<string>([
  "scripts/prepare-welcome-assets.mjs",
  "scripts/welcome-emoji-notice.txt",
  ".github/scripts/check-discord-bundle-symlinks.sh",
  ".github/scripts/package-discord-release.sh",
  ".github/scripts/verify-discord-release.sh",
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

/** Select backend/shared/toolchain changes that require one backend stage and compatible runtimes, excluding web-only paths. */
export function isConvexDeployPath(file: string): boolean {
  if (isWebOnlyPath(file)) return false
  return (
    [
      "packages/backend/",
      "packages/env/",
      "packages/logger/",
      "packages/shared/",
      "packages/typescript-config/",
      "ops/convex/",
    ].some((prefix) => file.startsWith(prefix)) ||
    [
      "package.json",
      "bun.lock",
      "bunfig.toml",
      "turbo.json",
      ".nvmrc",
      "convex.json",
      ".github/workflows/production-release.yml",
      ".github/scripts/production-policy.mjs",
      "apps/discord-bot/src/deployment/classifyChanges.ts",
      "apps/discord-bot/src/deployment/classifyChanges.test.ts",
    ].includes(file) ||
    /^tsconfig(?:\.[^/]+)?\.json$/.test(file) ||
    (/^(?:apps|packages)\/[^/]+\/package\.json$/.test(file) &&
      ![
        "apps/discord-bot/package.json",
        "apps/twitch-bot/package.json",
        "packages/ui/package.json",
      ].includes(file))
  )
}

/** Include Discord runtime/infrastructure and shared backend changes without restarting it for isolated web work. */
export function isDiscordDeployPath(file: string): boolean {
  if (isWebOnlyPath(file)) return false
  return (
    isConvexDeployPath(file) ||
    DEPLOY_FILES.has(file) ||
    DEPLOY_PREFIXES.some((prefix) => file.startsWith(prefix))
  )
}

/** Identify command-registry inputs; this classification does not bypass explicit post-activation verification. */
export function isCommandRegistrationPath(file: string): boolean {
  return (
    COMMAND_FILES.has(file) ||
    COMMAND_PREFIXES.some((prefix) => file.startsWith(prefix))
  )
}

/** Select Twitch runtime/infrastructure and shared backend changes while retaining independent service scope. */
export function isTwitchDeployPath(file: string): boolean {
  return (
    !isWebOnlyPath(file) &&
    (file.startsWith("apps/twitch-bot/") ||
      file.startsWith("ops/twitch/") ||
      file === ".github/workflows/twitch-production.yml" ||
      file === ".github/scripts/verify-twitch-release.sh" ||
      isConvexDeployPath(file))
  )
}

/** Summarize Discord activation and command-registry relevance for already validated repository paths. */
export function classifyChangedPaths(files: string[]) {
  return {
    deploy: files.some(isDiscordDeployPath),
    registerCommands: files.some(isCommandRegistrationPath),
  }
}

/**
 * Compare ancestor-checked commit snapshots using NUL-delimited paths and conservative config filtering.
 * @returns Relevant paths, or null when a trustworthy baseline is unavailable and deployment must be conservative.
 * @throws For malformed identities or failed Git diff, instead of silently skipping a necessary release.
 */
function changedPathsBetween(
  baseSha: string,
  headSha: string
): string[] | null {
  if (headSha.length !== 40 || !/^[a-f0-9]{40}$/.test(headSha)) {
    throw new Error("Invalid classification head SHA")
  }
  if (!baseSha) {
    return null
  }
  if (baseSha.length !== 40 || !/^[a-f0-9]{40}$/.test(baseSha)) {
    throw new Error("Invalid classification base SHA")
  }

  try {
    execFileSync("git", ["cat-file", "-e", `${baseSha}^{commit}`], {
      stdio: "ignore",
    })
    execFileSync("git", ["merge-base", "--is-ancestor", baseSha, headSha], {
      stdio: "ignore",
    })
  } catch {
    return null
  }

  return execFileSync("git", ["diff", "--name-only", "-z", baseSha, headSha], {
    encoding: "utf8",
  })
    .split("\0")
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
      try {
        return !isWebOnlyConfigChange(
          file,
          execFileSync("git", ["show", `${baseSha}:${file}`], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }),
          execFileSync("git", ["show", `${headSha}:${file}`], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          })
        )
      } catch {
        return true
      }
    })
}

/** Keep classification side effects out of module imports; run the CLI only for this resolved entrypoint. */
function isDirectEntrypoint(): boolean {
  const entrypoint = process.argv[1]
  return (
    entrypoint !== undefined &&
    pathToFileURL(path.resolve(entrypoint)).href === import.meta.url
  )
}

if (isDirectEntrypoint()) {
  const [, , mode = "commands", baseSha = "", requestedHeadSha] = process.argv
  if (!["commands", "backend", "twitch", "deploy"].includes(mode)) {
    throw new Error("Unknown classification mode")
  }
  const headSha =
    requestedHeadSha ??
    execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
      encoding: "utf8",
    }).trim()
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
