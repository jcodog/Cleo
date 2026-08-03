#!/usr/bin/env bash
set -euo pipefail
umask 0027

repository_root="${GITHUB_WORKSPACE:-$(pwd)}"
output_dir="${1:-${RUNNER_TEMP:-/tmp}/cleo-discord-artifact}"
sha="${CLEO_DISCORD_RELEASE_SHA:-$(git -C "$repository_root" rev-parse HEAD)}"
release_platform="$(node -p '`${process.platform}-${process.arch}`')"

is_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

if ! is_sha "$sha"; then
  echo "Release SHA is invalid: $sha" >&2
  exit 1
fi

if [[ "$release_platform" != "linux-x64" ]]; then
  echo "Discord production releases must be packaged for linux-x64; got $release_platform" >&2
  exit 1
fi

bundle_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/cleo-discord-bundle.XXXXXX")"
trap 'rm -rf -- "$bundle_dir"' EXIT

rm -rf -- "$output_dir"
mkdir -p "$output_dir"

command -v bun >/dev/null || {
  echo "Bun is required on the GitHub-hosted packaging runner." >&2
  exit 1
}

(
  cd "$repository_root"
  bun run --filter @workspace/discord-bot build
)

# Recreate the locked workspace graph in a temporary directory, then install
# only the Discord runtime closure. A hoisted staging layout is intentional:
# the immutable release runs under Node and must not depend on workspace or
# external-cache symlinks.
install -m 0644 "$repository_root/package.json" "$bundle_dir/package.json"
install -m 0644 "$repository_root/bun.lock" "$bundle_dir/bun.lock"
install -m 0644 "$repository_root/bunfig.toml" "$bundle_dir/bunfig.toml"

while IFS= read -r manifest; do
  relative_manifest="${manifest#"$repository_root/"}"
  install -d "$bundle_dir/$(dirname "$relative_manifest")"
  install -m 0644 "$manifest" "$bundle_dir/$relative_manifest"
done < <(
  find "$repository_root/apps" "$repository_root/packages" \
    -mindepth 2 -maxdepth 2 -type f -name package.json -print
)

(
  cd "$bundle_dir"
  bun install --frozen-lockfile --omit=dev \
    --filter @workspace/discord-bot --linker hoisted
)

rm -rf -- "$bundle_dir/apps" "$bundle_dir/packages"
rm -f -- "$bundle_dir/bun.lock" "$bundle_dir/bunfig.toml"
find "$bundle_dir/node_modules" -type d -name .bin -prune -exec rm -rf -- {} +

cp -a "$repository_root/apps/discord-bot/dist" "$bundle_dir/dist"
install -m 0644 \
  "$repository_root/apps/discord-bot/runtime-artifact.json" \
  "$bundle_dir/runtime-artifact.json"

node --input-type=module - "$repository_root" "$bundle_dir/package.json" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const [repositoryRoot, outputPath] = process.argv.slice(2)
const rootManifest = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8")
)
const appManifest = JSON.parse(
  readFileSync(
    path.join(repositoryRoot, "apps/discord-bot/package.json"),
    "utf8"
  )
)
const runtimeManifest = {
  name: appManifest.name,
  version: appManifest.version,
  private: true,
  type: appManifest.type,
  engines: rootManifest.engines,
  scripts: {
    start: appManifest.scripts["start:production"],
    "commands:register": appManifest.scripts["commands:register:production"],
  },
  dependencies: appManifest.dependencies,
}

writeFileSync(outputPath, `${JSON.stringify(runtimeManifest, null, 2)}\n`)
NODE

install -m 0644 "$repository_root/.nvmrc" "$bundle_dir/.nvmrc"
printf '%s\n' "$sha" > "$bundle_dir/.cleo-release-sha"
printf '%s\n' "$release_platform" > "$bundle_dir/.cleo-release-platform"

find "$bundle_dir" -type f -name '.env*' -delete

for required_path in runtime-artifact.json dist/deployment/validateReleaseArtifact.js; do
  if [[ ! -e "$bundle_dir/$required_path" ]]; then
    echo "Packaged Discord release is missing $required_path" >&2
    find "$bundle_dir" -maxdepth 4 \( -type f -o -type l \) | sort | head -200 >&2
    exit 1
  fi
done

node --input-type=module -e '
  import path from "node:path"
  import { pathToFileURL } from "node:url"
  const [root, expectedSha, expectedPlatform] = process.argv.slice(1)
  const validatorUrl = pathToFileURL(path.join(root, "dist/deployment/validateReleaseArtifact.js")).href
  const { validateReleaseArtifactDirectory } = await import(validatorUrl)
  validateReleaseArtifactDirectory(root, { expectedSha, expectedPlatform })
' "$bundle_dir" "$sha" "$release_platform"

(
  cd "$bundle_dir"
  node --input-type=module -e 'await import("./dist/scripts/registerCommands.js")'
  node --input-type=module -e '
    const { createCanvas } = await import("@napi-rs/canvas")
    const canvas = createCanvas(2, 2)
    await canvas.encode("png")
  '

  set +e
  runtime_output="$({
    NODE_ENV=production DISCORD_BOT_RUNTIME_MODE=invalid \
      node --enable-source-maps dist/index.js
  } 2>&1)"
  runtime_status=$?
  set -e

  if [[ "$runtime_status" -eq 0 ]] || \
    [[ "$runtime_output" != *"Invalid DISCORD_BOT_RUNTIME_MODE"* ]]; then
    echo "Compiled Discord runtime probe did not reach runtime configuration validation." >&2
    printf '%s\n' "$runtime_output" >&2
    exit 1
  fi
)

archive_name="cleo-discord-${sha}.tar.gz"
archive_path="$output_dir/$archive_name"
checksum_path="$archive_path.sha256"

source_date_epoch="$(git -C "$repository_root" show -s --format=%ct "$sha")"
tar --sort=name --mtime="@$source_date_epoch" --owner=0 --group=0 \
  --numeric-owner -C "$bundle_dir" -czf "$archive_path" .
(
  cd "$output_dir"
  sha256sum "$archive_name" > "${archive_name}.sha256"
)

printf 'archive=%s\n' "$archive_path" >> "${GITHUB_OUTPUT:-/dev/null}"
printf 'checksum=%s\n' "$checksum_path" >> "${GITHUB_OUTPUT:-/dev/null}"
printf 'artifact_name=discord-release-%s\n' "$sha" >> "${GITHUB_OUTPUT:-/dev/null}"
printf 'platform=%s\n' "$release_platform" >> "${GITHUB_OUTPUT:-/dev/null}"

echo "Packaged Discord release $sha for $release_platform at $archive_path"
