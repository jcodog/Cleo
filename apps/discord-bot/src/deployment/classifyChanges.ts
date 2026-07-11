import { execFileSync } from "node:child_process"
import path from "node:path"
import { pathToFileURL } from "node:url"

const DEPLOY_PREFIXES = [
  "apps/discord-bot/",
  "packages/backend/",
  "packages/env/",
  "packages/logger/",
  "packages/shared/",
  "packages/eslint-config/",
  "packages/typescript-config/",
] as const

const DEPLOY_FILES = new Set<string>([
  ".github/scripts/check-discord-runner.sh",
  ".github/scripts/deploy-discord.sh",
  ".github/scripts/package-discord-release.sh",
  ".github/workflows/discord-production.yml",
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
])

const COMMAND_PREFIXES = ["apps/discord-bot/src/handlers/commands/"] as const

const COMMAND_FILES = new Set<string>([
  "apps/discord-bot/src/classes/Command.ts",
  "apps/discord-bot/src/loaders/loadCommands.ts",
  "apps/discord-bot/src/scripts/registerCommands.ts",
])

export function isDiscordDeployPath(file: string): boolean {
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
      : mode === "deploy"
        ? classifyChangedPaths(changedPaths).deploy
        : classifyChangedPaths(changedPaths).registerCommands
  process.stdout.write(String(changed))
}
